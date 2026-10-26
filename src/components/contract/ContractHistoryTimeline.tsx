'use client';

import { useMemo, useState } from 'react';
import { Badge, Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { DateBlock } from '@components/data/DateBlock';
import { RawJsonDisclosure } from '@components/data/RawJsonDisclosure';
import { contractHistoryEntries } from '@util/contract';
import { diffJson, summarizeDiff, type DiffEntry } from '@util/json-diff';
import { safeStringify } from '@util/wasm-json';

const KIND_COLOR: Record<DiffEntry['kind'], string> = { added: 'green', removed: 'red', changed: 'orange' };
const MAX_INLINE = 160;

function compact(value: unknown): string {
  const text = safeStringify(value, 0);
  return text.length > MAX_INLINE ? `${text.slice(0, MAX_INLINE)}…` : text;
}

function DiffList({ entries }: { entries: DiffEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, 50);
  return (
    <VStack align="stretch" spacing={1} fontFamily="mono" fontSize="xs">
      {shown.map((e) => (
        <Box key={`${e.kind}:${e.path}`} borderLeft="2px solid" borderColor={`${KIND_COLOR[e.kind]}.400`} pl={2} py={0.5}>
          <HStack spacing={2} align="baseline" flexWrap="wrap">
            <Badge colorScheme={KIND_COLOR[e.kind]} variant="subtle" fontSize="2xs">{e.kind}</Badge>
            <Text color="gray.100" wordBreak="break-all">{e.path}</Text>
          </HStack>
          {e.kind !== 'added' ? (
            <Text color="red.200" wordBreak="break-all">− {compact(e.before)}</Text>
          ) : null}
          {e.kind !== 'removed' ? (
            <Text color="green.200" wordBreak="break-all">+ {compact(e.after)}</Text>
          ) : null}
        </Box>
      ))}
      {entries.length > shown.length ? (
        <Button size="xs" variant="ghost" alignSelf="flex-start" onClick={() => setShowAll(true)}>
          Show all {entries.length} changes
        </Button>
      ) : null}
    </VStack>
  );
}

/** Contract versions newest first, each diffed against the version before it. */
export function ContractHistoryTimeline({ history }: { history: unknown }) {
  const versions = useMemo(() => {
    const entries = contractHistoryEntries(history);
    return entries
      .map((entry, i) => ({
        ...entry,
        diff: i === 0 ? null : diffJson(entries[i - 1]!.definition, entry.definition),
      }))
      .reverse();
  }, [history]);

  if (versions.length === 0) {
    return <Text color="gray.400" fontSize="sm">Platform returned no stored versions for this contract.</Text>;
  }

  return (
    <VStack as="ol" align="stretch" spacing={0} listStyleType="none" aria-label="Contract versions">
      {versions.map((v, i) => {
        const counts = v.diff ? summarizeDiff(v.diff) : null;
        return (
          <Box as="li" key={v.timestampMs} position="relative" pl={6} pb={i === versions.length - 1 ? 0 : 5}>
            <Box position="absolute" left="7px" top={2} bottom={0} borderLeft="1px solid" borderColor={i === versions.length - 1 ? 'transparent' : 'gray.700'} />
            <Box position="absolute" left="2px" top="6px" w="11px" h="11px" borderRadius="full" bg={i === 0 ? 'brand.normal' : 'gray.600'} />
            <VStack align="stretch" spacing={2}>
              <HStack spacing={3} flexWrap="wrap">
                <Text fontWeight={600} color="gray.100">
                  {v.version !== undefined ? `Version ${v.version}` : 'Version'}
                </Text>
                {i === 0 ? <Badge colorScheme="blue" variant="subtle">latest stored</Badge> : null}
                <DateBlock value={v.timestampMs} />
                {counts ? (
                  <Text fontSize="xs" color="gray.400">
                    {counts.added} added · {counts.removed} removed · {counts.changed} changed
                  </Text>
                ) : (
                  <Text fontSize="xs" color="gray.400">initial stored version</Text>
                )}
              </HStack>
              {v.diff && v.diff.length > 0 ? <DiffList entries={v.diff} /> : null}
              {v.diff && v.diff.length === 0 ? (
                <Text fontSize="xs" color="gray.400">No change to schemas, tokens, groups, keywords or description.</Text>
              ) : null}
              <RawJsonDisclosure value={v.definition} label="Definition at this version" />
            </VStack>
          </Box>
        );
      })}
    </VStack>
  );
}
