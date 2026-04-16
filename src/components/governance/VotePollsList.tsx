'use client';

import NextLink from 'next/link';
import { Badge, Box, HStack, Text, VStack } from '@chakra-ui/react';
import { DateBlock } from '@components/data/DateBlock';
import { CodeBlock } from '@components/data/CodeBlock';
import { Identifier } from '@components/data/Identifier';
import { readProp } from '@util/sdk-shape';
import { toPlain } from '@util/contract';

interface PollRowProps {
  entry: unknown;
}

function pollDescriptor(poll: unknown): {
  contractId?: string;
  docType?: string;
  indexName?: string;
  indexValues?: unknown[];
} {
  const p = toPlain(poll) as Record<string, unknown> | undefined;
  const nested =
    p && typeof p === 'object'
      ? ((p.contestedDocumentResourceVotePoll as Record<string, unknown> | undefined) ??
        (p.ContestedDocumentResourceVotePoll as Record<string, unknown> | undefined) ??
        p)
      : undefined;
  const contractId = String(
    readProp<string>(nested, 'contractId') ??
      readProp<string>(nested, 'dataContractId') ??
      '',
  );
  const docType = String(readProp<string>(nested, 'documentTypeName') ?? '');
  const indexName = String(readProp<string>(nested, 'indexName') ?? '');
  const indexValues = readProp<unknown[]>(nested, 'indexValues');
  return {
    contractId: contractId || undefined,
    docType: docType || undefined,
    indexName: indexName || undefined,
    indexValues: Array.isArray(indexValues) ? indexValues : undefined,
  };
}

function PollEntryRow({ entry }: PollRowProps) {
  const timestampMs = readProp<bigint | number>(entry, 'timestampMs');
  const ms = timestampMs !== undefined ? Number(timestampMs) : null;
  const polls = (readProp<unknown[]>(entry, 'votePolls') as unknown[] | undefined) ?? [];

  return (
    <Box
      borderTop="1px solid"
      borderColor="whiteAlpha.50"
      py={2.5}
      _first={{ borderTop: 'none', pt: 0 }}
    >
      <HStack justify="space-between" align="flex-start" mb={2} flexWrap="wrap" spacing={3}>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          Ends
        </Text>
        <DateBlock value={ms} />
      </HStack>
      <VStack align="stretch" spacing={1.5}>
        {polls.length === 0 ? (
          <Text fontSize="xs" color="gray.400">
            No polls recorded for this bucket.
          </Text>
        ) : (
          polls.map((p, i) => {
            const d = pollDescriptor(p);
            const hasLink = d.contractId && d.docType && d.indexName && d.indexValues;
            const href = hasLink
              ? `/governance/contested/detail/?contract=${encodeURIComponent(
                  d.contractId!,
                )}&docType=${encodeURIComponent(d.docType!)}&indexName=${encodeURIComponent(
                  d.indexName!,
                )}&indexValues=${encodeURIComponent(JSON.stringify(d.indexValues))}`
              : null;
            const label =
              d.indexValues && d.indexValues.length > 0
                ? d.indexValues.map((v) => String(v)).join(' / ')
                : null;
            return (
              <HStack
                key={i}
                spacing={2}
                as={href ? NextLink : 'div'}
                {...(href ? { href } : {})}
                px={2}
                py={1}
                borderRadius="md"
                bg="gray.800"
                _hover={href ? { bg: 'gray.750' } : undefined}
                flexWrap="wrap"
              >
                {d.contractId ? (
                  <Identifier
                    value={d.contractId}
                    avatar={false}
                    copy={false}
                    dense
                  />
                ) : null}
                {d.docType ? (
                  <Badge size="sm" variant="subtle" colorScheme="blue" textTransform="none">
                    {d.docType}
                  </Badge>
                ) : null}
                {label ? (
                  <Text fontSize="xs" color="gray.100" fontFamily="mono">
                    {label}
                  </Text>
                ) : null}
                {!hasLink && !label ? (
                  <CodeBlock value={p} collapsedHeight={60} />
                ) : null}
              </HStack>
            );
          })
        )}
      </VStack>
    </Box>
  );
}

export function VotePollsList({ entries }: { entries: unknown[] }) {
  if (!entries || entries.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        No polls ending in this range.
      </Text>
    );
  }
  return (
    <VStack align="stretch" spacing={0}>
      {entries.map((e, i) => (
        <PollEntryRow key={i} entry={e} />
      ))}
    </VStack>
  );
}
