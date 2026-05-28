'use client';

import { useMemo } from 'react';
import {
  Box,
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
import { Identifier } from '@dashevo/evo-sdk';
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
    case 1: return BigInt(view.getInt8(0));
    case 2: return BigInt(view.getInt16(0, false));
    case 4: return BigInt(view.getInt32(0, false));
    case 8: return view.getBigInt64(0, false);
    default: return undefined;
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
 *  getDocumentsCount). When we know the property schema we decode by type;
 *  otherwise we fall back to printable-ASCII / fixed-width-int heuristics. */
function decodeGroupKey(
  hex: string,
  propertySchema?: Record<string, unknown>,
): { display: string; raw?: string } {
  if (!hex) return { display: '(all)' };
  if (hex.length % 2 !== 0) return { display: `0x${hex}` };
  const bytes = hexToBytes(hex);

  // ── Schema-driven path ──────────────────────────────────────────────
  if (propertySchema) {
    const type = propertySchema.type as string | undefined;
    const isByteArray = propertySchema.byteArray === true;
    const mediaType = propertySchema.contentMediaType as string | undefined;

    if (type === 'string') {
      return { display: decodeUtf8(bytes) ?? `0x${hex}`, raw: hex };
    }
    if (type === 'integer') {
      const n = decodeIndexedInt(bytes);
      return n !== undefined
        ? { display: n.toString(), raw: hex }
        : { display: `0x${hex}` };
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
          return { display: new Identifier(bytes).toBase58(), raw: hex };
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

function fmtAvg(p: CountSumPair): string {
  if (p.count === 0n) return '—';
  // BigInt arithmetic with a 4-place fractional component, then back to string.
  // Avoids Number precision loss for large sums. BigInt `%` keeps the sign of
  // the dividend, so for negative averages we strip the sign off `frac` and
  // let the leading `-` on `whole` carry it.
  const SCALE = 10_000n;
  const scaled = (p.sum * SCALE) / p.count;
  const whole = scaled / SCALE;
  const frac = scaled % SCALE;
  const absFrac = frac < 0n ? -frac : frac;
  const fracStr = absFrac.toString().padStart(4, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
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
  data,
  isLoading,
  isError,
  error,
  refetch,
}: AggregateResultsProps) {
  // Today we only render one group-key column even for compound GROUP BY
  // (the SDK collapses compound count into a flat map keyed by the second
  // field). Use the matching schema entry — last one for compound, first for
  // single-field.
  const groupByPrimarySchema = groupBySchemas?.[groupBySchemas.length - 1];
  const grouped = !!groupBy && groupBy.length > 0;

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

  return (
    <InfoBlock>
      {isLoading ? (
        <LoadingCard lines={3} />
      ) : isError ? (
        <ErrorCard error={error} onRetry={refetch} />
      ) : !data ? (
        <Text fontSize="sm" color="gray.400">No data.</Text>
      ) : grouped ? (
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Heading size="xs" color="gray.100" fontFamily="mono">
              {totalLabel(kind, aggregateField)} GROUP BY {groupBy!.join(', ')}
            </Heading>
            <Text fontSize="xs" color="gray.400">
              {rows.length} group{rows.length === 1 ? '' : 's'}
            </Text>
          </HStack>
          <Box overflowX="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th color="gray.400" fontFamily="mono">{groupBy!.join(' / ')}</Th>
                  {kind === 'avg' ? (
                    <>
                      <Th color="gray.400" isNumeric>count</Th>
                      <Th color="gray.400" isNumeric>sum</Th>
                      <Th color="gray.400" isNumeric>avg</Th>
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
                    <Td fontFamily="mono" fontSize="xs" color="gray.100" title={decoded.raw ? `0x${decoded.raw}` : undefined}>
                      {decoded.display}
                    </Td>
                    {isCountSumPair(value) ? (
                      <>
                        <Td isNumeric fontFamily="mono" fontSize="xs">{fmtBigInt(value.count)}</Td>
                        <Td isNumeric fontFamily="mono" fontSize="xs">{fmtBigInt(value.sum)}</Td>
                        <Td isNumeric fontFamily="mono" fontSize="xs" color="brand.300">{fmtAvg(value)}</Td>
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
            <Text fontSize="sm" color="gray.400">No result returned.</Text>
          ) : isCountSumPair(totalEntry) ? (
            <HStack spacing={6} align="flex-end">
              <Box>
                <Text fontSize="3xl" color="brand.300" fontFamily="mono" lineHeight={1}>
                  {fmtAvg(totalEntry)}
                </Text>
                <Text fontSize="2xs" color="gray.500" mt={1}>
                  avg
                </Text>
              </Box>
              <Box>
                <Text fontSize="md" color="gray.200" fontFamily="mono">
                  {fmtBigInt(totalEntry.sum)}
                </Text>
                <Text fontSize="2xs" color="gray.500">sum</Text>
              </Box>
              <Box>
                <Text fontSize="md" color="gray.200" fontFamily="mono">
                  {fmtBigInt(totalEntry.count)}
                </Text>
                <Text fontSize="2xs" color="gray.500">count</Text>
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
