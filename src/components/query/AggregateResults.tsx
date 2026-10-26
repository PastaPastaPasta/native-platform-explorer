'use client';

import { useMemo } from 'react';
import {
  Box,
  Code,
  Heading,
  HStack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { idToString } from '@util/sdk-shape';
import { formatAverage } from '@util/query-workspace';
import type { AggregateKind } from '@util/sql-parser';
import type { CountSumPair } from '@sdk/queries';

export type AggregateResultMap = Map<string, bigint | CountSumPair>;

/** JSON-schema fragment for the GROUP BY field(s), positionally aligned with
 *  the `groupBy` array. Lets us type-aware-decode the SDK's hex-encoded keys. */
export type GroupByPropertySchemas = Array<Record<string, unknown> | undefined>;

export interface AggregateResultsProps {
  kind: AggregateKind;
  aggregateField?: string;
  groupBy?: string[];
  groupBySchemas?: GroupByPropertySchemas;
  /** Most entries the server returns, when that can truncate the groups (see `aggregateGroupBound`). */
  groupBound?: { limit: number; entriesPerGroup: number };
  /** GROUP BY field that also carries the range filter, when groups are distinct range values. */
  rangeGroupField?: string;
  /** Groups are walked in descending order (first ORDER BY is DESC). */
  descending?: boolean;
  data: AggregateResultMap | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null | undefined;
  refetch: () => void;
}

function isCountSumPair(v: unknown): v is CountSumPair {
  return !!v && typeof v === 'object' && 'count' in v && 'sum' in v;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Decode an indexed integer key. Platform writes integer index keys as
 *  fixed-width big-endian with the MSB sign-flipped so unsigned byte-order
 *  matches signed numeric order. Handles the standard widths (1/2/4/8). */
function decodeIndexedInt(bytes: Uint8Array): bigint | undefined {
  const flipped = new Uint8Array(bytes);
  flipped[0] = flipped[0]! ^ 0x80;
  const view = new DataView(flipped.buffer, flipped.byteOffset, flipped.byteLength);
  switch (bytes.length) {
    case 1:
      return BigInt(view.getInt8(0));
    case 2:
      return BigInt(view.getInt16(0, false));
    case 4:
      return BigInt(view.getInt32(0, false));
    case 8:
      return view.getBigInt64(0, false);
    default:
      return undefined;
  }
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** GROUP BY map keys arrive as hex-encoded "canonical bytes" of the
 *  splitting property's value (per the wasm-sdk doc comment on
 *  documents.count). When we know the property schema we decode by type;
 *  otherwise we fall back to printable-ASCII / fixed-width-int heuristics. */
function decodeGroupKey(
  hex: string,
  propertySchema?: Record<string, unknown>,
): { display: string; raw?: string; literal?: string } {
  if (!hex) return { display: '(all)' };
  if (hex.length % 2 !== 0) return { display: `0x${hex}` };
  const bytes = hexToBytes(hex);

  // ── Schema-driven path ──────────────────────────────────────────────
  if (propertySchema) {
    const type = propertySchema.type as string | undefined;
    const isByteArray = propertySchema.byteArray === true;
    const mediaType = propertySchema.contentMediaType as string | undefined;

    if (type === 'string') {
      const text = decodeUtf8(bytes);
      return text === undefined
        ? { display: `0x${hex}`, raw: hex }
        : { display: text, raw: hex, literal: `'${text.replace(/'/g, "''")}'` };
    }
    if (type === 'integer') {
      const n = decodeIndexedInt(bytes);
      return n !== undefined ? { display: n.toString(), raw: hex, literal: n.toString() } : { display: `0x${hex}` };
    }
    if (type === 'boolean') {
      if (bytes.length === 1) return { display: bytes[0] === 0 ? 'false' : 'true', raw: hex };
      return { display: `0x${hex}` };
    }
    if (type === 'array' && isByteArray) {
      // Identifier (32-byte) → base58 via the SDK class. Generic byte arrays
      // stay as hex.
      if (mediaType === 'application/x.dash.dpp.identifier' && bytes.length === 32) {
        try {
          return { display: idToString(bytes)!, raw: hex };
        } catch {
          /* fall through to hex */
        }
      }
      return { display: `0x${hex}` };
    }
    // Unknown declared type → heuristic.
  }

  // ── Heuristic fallback ──────────────────────────────────────────────
  const printable = bytes.length > 0 && bytes.every((b) => b >= 0x20 && b < 0x7f);
  if (printable) {
    const s = decodeUtf8(bytes);
    if (s !== undefined) return { display: s, raw: hex };
  }
  if (bytes.length === 1 || bytes.length === 2 || bytes.length === 4 || bytes.length === 8) {
    const n = decodeIndexedInt(bytes);
    if (n !== undefined) return { display: n.toString(), raw: hex };
  }
  return { display: `0x${hex}` };
}

function fmtBigInt(n: bigint): string {
  return n.toLocaleString();
}

function totalLabel(kind: AggregateKind, field?: string): string {
  if (kind === 'count') return 'COUNT(*)';
  if (kind === 'sum') return `SUM(${field ?? '?'})`;
  return `AVG(${field ?? '?'})`;
}

export function AggregateResults({
  kind,
  aggregateField,
  groupBy,
  groupBySchemas,
  groupBound,
  rangeGroupField,
  descending,
  data,
  isLoading,
  isError,
  error,
  refetch,
}: AggregateResultsProps) {
  // The SDK merges compound GROUP BY (a, b) entries by b, summing across
  // every a, so only the last field is a real column. Use its schema.
  const groupByPrimarySchema = groupBySchemas?.[groupBySchemas.length - 1];
  const grouped = !!groupBy && groupBy.length > 0;
  const groupField = groupBy?.[groupBy.length - 1];
  const mergedFields = groupBy?.slice(0, -1) ?? [];

  // The aggregate map's `""` key is the global total; per-group entries are
  // keyed by the hex-encoded canonical bytes of the splitting property value
  // (see drive book / count-index-examples). For human-readable display we
  // decode common shapes inline.
  const rows = useMemo(() => {
    if (!data) return [];
    const out: Array<{ key: string; value: bigint | CountSumPair }> = [];
    for (const [k, v] of data.entries()) {
      out.push({ key: k, value: v });
    }
    return out;
  }, [data]);

  const totalEntry = useMemo(() => {
    if (!data) return undefined;
    return data.get('');
  }, [data]);

  // Server entries stop at the limit. Compound rows each merge up to one entry
  // per IN value, so they may be truncated before the row count reaches it.
  // Testnet answers some grouped shapes with a single total row; a page limit says nothing about it.
  const singleTotal = rows.length === 1 && rows[0]!.key === '';
  const truncated =
    grouped && !singleTotal && !!groupBound && rows.length * groupBound.entriesPerGroup >= groupBound.limit;
  const merged = !!groupBound && groupBound.entriesPerGroup > 1;
  const mergedEntries = mergedFields.length
    ? `(${mergedFields.join(', ')}, ${groupField}) pairs`
    : `entries (one per IN value for each ${groupField} value)`;
  const lastLiteral = truncated && !merged && rangeGroupField === groupField && rows.length
    ? decodeGroupKey(rows[rows.length - 1]!.key, groupByPrimarySchema).literal
    : undefined;

  return (
    <InfoBlock>
      {isLoading ? (
        <LoadingCard lines={3} />
      ) : isError ? (
        <ErrorCard error={error} onRetry={refetch} />
      ) : !data ? (
        <Text fontSize="sm" color="gray.400">
          No data.
        </Text>
      ) : grouped ? (
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Heading size="xs" color="gray.100" fontFamily="mono">
              {totalLabel(kind, aggregateField)} GROUP BY {groupBy!.join(', ')}
            </Heading>
            <Text fontSize="xs" color="gray.400">
              {rows.length}
              {truncated ? '+' : ''} group{rows.length === 1 ? '' : 's'}
            </Text>
          </HStack>
          {mergedFields.length > 0 && (
            <Text fontSize="xs" color="gray.400">
              One row per <Code fontSize="2xs">{groupField}</Code> value, totalled across every{' '}
              <Code fontSize="2xs">{mergedFields.join(', ')}</Code> value in the filter. The SDK merges
              compound groups this way; run one statement per{' '}
              <Code fontSize="2xs">{mergedFields.join(', ')}</Code> value for separate rows.
            </Text>
          )}
          {singleTotal && (
            <Text role="note" fontSize="xs" color="orange.300">
              This GROUP BY came back as one total instead of a row per{' '}
              <Code fontSize="2xs">{groupField}</Code> value, as testnet does for two ranges, or IN with a range,
              grouped by one field. Run one statement per value for separate totals.
            </Text>
          )}
          {truncated && (
            <Text role="status" fontSize="xs" color="orange.300">
              {merged
                ? `Platform returns at most ${groupBound!.limit} ${mergedEntries} before the SDK merges them, so these ${rows.length} groups may be incomplete. `
                : `Showing the first ${rows.length} groups: the limit of ${groupBound!.limit} was reached, so more groups may exist. `}
              Aggregates have no page cursor.{' '}
              {lastLiteral ? (
                <>
                  To continue, filter on{' '}
                  <Code fontSize="2xs">
                    {rangeGroupField} {descending ? '<' : '>'} {lastLiteral}
                  </Code>{' '}
                  instead of the current {descending ? 'upper' : 'lower'} bound.
                </>
              ) : (
                'Narrow the WHERE filter to see the rest.'
              )}
            </Text>
          )}
          <Box overflowX="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th color="gray.400" fontFamily="mono">
                    {groupField}
                  </Th>
                  {kind === 'avg' ? (
                    <>
                      <Th color="gray.400" isNumeric>
                        count
                      </Th>
                      <Th color="gray.400" isNumeric>
                        sum
                      </Th>
                      <Th color="gray.400" isNumeric>
                        avg
                      </Th>
                    </>
                  ) : (
                    <Th color="gray.400" isNumeric>
                      {kind === 'count' ? 'count' : 'sum'}
                    </Th>
                  )}
                </Tr>
              </Thead>
              <Tbody>
                {rows.map(({ key, value }) => {
                  const decoded = decodeGroupKey(key, groupByPrimarySchema);
                  return (
                    <Tr key={key || '(total)'}>
                      <Td
                        fontFamily="mono"
                        fontSize="xs"
                        color="gray.100"
                        title={decoded.raw ? `0x${decoded.raw}` : undefined}
                      >
                        {decoded.display}
                      </Td>
                      {isCountSumPair(value) ? (
                        <>
                          <Td isNumeric fontFamily="mono" fontSize="xs">
                            {fmtBigInt(value.count)}
                          </Td>
                          <Td isNumeric fontFamily="mono" fontSize="xs">
                            {fmtBigInt(value.sum)}
                          </Td>
                          <Td isNumeric fontFamily="mono" fontSize="xs" color="brand.300">
                            {formatAverage(value.sum, value.count)}
                          </Td>
                        </>
                      ) : (
                        <Td isNumeric fontFamily="mono" fontSize="xs" color="brand.300">
                          {fmtBigInt(value)}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        </VStack>
      ) : (
        // Single-row aggregate — render as a hero number.
        <VStack align="stretch" spacing={2}>
          <Text fontSize="xs" color="gray.400" fontFamily="mono">
            {totalLabel(kind, aggregateField)}
          </Text>
          {totalEntry === undefined ? (
            <Text fontSize="sm" color="gray.400">
              No result returned.
            </Text>
          ) : isCountSumPair(totalEntry) ? (
            <HStack spacing={6} align="flex-end">
              <Box>
                <Text fontSize="3xl" color="brand.300" fontFamily="mono" lineHeight={1}>
                  {formatAverage(totalEntry.sum, totalEntry.count)}
                </Text>
                <Text fontSize="2xs" color="gray.500" mt={1}>
                  avg
                </Text>
              </Box>
              <Box>
                <Text fontSize="md" color="gray.200" fontFamily="mono">
                  {fmtBigInt(totalEntry.sum)}
                </Text>
                <Text fontSize="2xs" color="gray.500">
                  sum
                </Text>
              </Box>
              <Box>
                <Text fontSize="md" color="gray.200" fontFamily="mono">
                  {fmtBigInt(totalEntry.count)}
                </Text>
                <Text fontSize="2xs" color="gray.500">
                  count
                </Text>
              </Box>
            </HStack>
          ) : (
            <Text fontSize="3xl" color="brand.300" fontFamily="mono" lineHeight={1}>
              {fmtBigInt(totalEntry)}
            </Text>
          )}
        </VStack>
      )}
    </InfoBlock>
  );
}
