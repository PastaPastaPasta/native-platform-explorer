'use client';

import { useMemo, useState } from 'react';
import { Badge, Box, HStack, Text, VStack } from '@chakra-ui/react';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { DateBlock } from '@components/data/DateBlock';
import { IdentityLink } from '@components/data/IdentityLink';
import { RawJsonDisclosure } from '@components/data/RawJsonDisclosure';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { DOCUMENT_HISTORY_PAGE, useDocumentHistory } from '@sdk/queries';
import { diffJson } from '@util/json-diff';
import { idToString, readProp } from '@util/sdk-shape';
import { safeStringify } from '@util/wasm-json';

interface Revision {
  timestampMs: number;
  revision?: string;
  ownerId?: string;
  properties: Record<string, unknown>;
}

/** `documents.history` → revisions oldest first. Keys are block times (ms). */
export function documentRevisions(data: unknown): Revision[] {
  const entries: Array<[unknown, unknown]> = data instanceof Map ? [...data.entries()] : [];
  return entries
    .map(([key, doc]) => {
      const props = readProp<unknown>(doc, 'properties');
      const revision = readProp<bigint | number>(doc, 'revision');
      return {
        timestampMs: Number(key),
        revision: revision === undefined || revision === null ? undefined : String(revision),
        ownerId: idToString(readProp<unknown>(doc, 'ownerId')),
        properties: props && typeof props === 'object' ? (props as Record<string, unknown>) : {},
      };
    })
    .filter((r) => Number.isFinite(r.timestampMs))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function short(value: unknown): string {
  const text = safeStringify(value, 0);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/** A page cursor: revisions after `afterMs`, plus the revision just before
 *  them so the first one on the page can still be diffed. */
interface Cursor {
  afterMs: number;
  previous?: Revision;
}

export function DocumentHistorySection({
  contractId,
  type,
  docId,
  keepsHistory,
}: {
  contractId: string;
  type: string;
  docId: string;
  keepsHistory: boolean;
}) {
  const [cursors, setCursors] = useState<Cursor[]>([{ afterMs: 0 }]);
  const cursor = cursors[cursors.length - 1]!;
  const q = useDocumentHistory(contractId, type, docId, keepsHistory, cursor.afterMs);
  const revisions = useMemo(() => documentRevisions(q.data), [q.data]);

  if (!keepsHistory) {
    return (
      <Text fontSize="sm" color="gray.400">
        The <code>{type}</code> document type does not keep history (<code>documentsKeepHistory</code> is
        off), so Platform stores only the current revision. Earlier revisions cannot be retrieved.
      </Text>
    );
  }
  if (q.isLoading) return <LoadingCard lines={3} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  if (revisions.length === 0 && cursors.length === 1) {
    return <Text fontSize="sm" color="gray.400">Platform returned no stored revisions.</Text>;
  }

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="xs" color="gray.400">
        Oldest first, {DOCUMENT_HISTORY_PAGE} per page (Platform&apos;s limit). Each revision is compared with the one before it.
      </Text>
      {revisions.map((r, i) => {
        const previous = i > 0 ? revisions[i - 1] : cursor.previous;
        const changes = previous ? diffJson(previous.properties, r.properties) : [];
        const isLatest = i === revisions.length - 1 && revisions.length < DOCUMENT_HISTORY_PAGE;
        return (
          <Box key={r.timestampMs} borderLeft="2px solid" borderColor={isLatest ? 'brand.normal' : 'gray.700'} pl={3}>
            <HStack spacing={3} flexWrap="wrap">
              <Text fontWeight={600} color="gray.100">Revision {r.revision ?? '?'}</Text>
              {isLatest ? <Badge colorScheme="blue" variant="subtle">latest</Badge> : null}
              <DateBlock value={r.timestampMs} />
              {previous && r.ownerId && previous.ownerId && r.ownerId !== previous.ownerId ? (
                <Text fontSize="xs" color="gray.250">owner → <IdentityLink id={r.ownerId} dense /></Text>
              ) : null}
            </HStack>
            {previous ? (
              changes.length === 0 ? (
                <Text fontSize="xs" color="gray.400">No property changes.</Text>
              ) : (
                <VStack align="stretch" spacing={0.5} mt={1} fontFamily="mono" fontSize="xs">
                  {changes.map((c) => (
                    <Text key={c.path} color="gray.250" wordBreak="break-all">
                      <Text as="span" color={c.kind === 'added' ? 'green.300' : c.kind === 'removed' ? 'red.300' : 'orange.300'}>{c.kind}</Text>{' '}
                      {c.path}: {c.kind !== 'added' ? short(c.before) : ''}{c.kind === 'changed' ? ' → ' : ''}{c.kind !== 'removed' ? short(c.after) : ''}
                    </Text>
                  ))}
                </VStack>
              )
            ) : (
              <Text fontSize="xs" color="gray.400">Oldest stored revision.</Text>
            )}
            <RawJsonDisclosure value={r.properties} label="Properties at this revision" />
          </Box>
        );
      })}
      {revisions.length === 0 ? <Text fontSize="sm" color="gray.400">No later revisions.</Text> : null}
      <CursorPagination
        pageIndex={cursors.length - 1}
        hasPrev={cursors.length > 1}
        hasNext={revisions.length === DOCUMENT_HISTORY_PAGE}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
        onNext={() => {
          const last = revisions[revisions.length - 1];
          if (last) setCursors((c) => [...c, { afterMs: last.timestampMs, previous: last }]);
        }}
      />
    </VStack>
  );
}
