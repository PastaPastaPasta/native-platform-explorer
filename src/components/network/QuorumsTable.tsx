'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';
import { Identifier } from '@components/data/Identifier';
import { normaliseQuorums, quorumBreakdown, type QuorumGroup } from '@util/quorums';

const UNKNOWN_TYPE = 'LLMQ_TYPE_UNKNOWN';

function TypeLabel({ type }: { type: string }) {
  if (type !== UNKNOWN_TYPE) return <>{type}</>;
  return (
    <Text as="span" color="gray.400" title="The pinned SDK does not recognise this LLMQ type">
      {type}
    </Text>
  );
}

/** Quorums grouped by reported type and size. */
export function QuorumBreakdownList({ groups }: { groups: QuorumGroup[] }) {
  if (groups.length === 0) {
    return (
      <Text color="muted" fontSize="sm" fontFamily="mono">
        No quorums reported.
      </Text>
    );
  }
  return (
    <VStack align="stretch" spacing={0} divider={<Box h="1px" bg="hairline" />}>
      {groups.map((g) => (
        <HStack
          key={`${g.quorumType}|${g.memberCount}|${g.threshold}`}
          justify="space-between"
          py={2.5}
          spacing={3}
        >
          <VStack align="flex-start" spacing={0} minW={0}>
            <Text fontFamily="mono" fontSize="13px" color="ink">
              <TypeLabel type={g.quorumType} />
            </Text>
            <Text fontFamily="mono" fontSize="11px" color="muted">
              {g.memberCount ?? '—'} members · threshold {g.threshold ?? '—'}
            </Text>
          </VStack>
          <Text fontFamily="mono" fontSize="lg" color="ink" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {g.count}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}

/** `system.currentQuorumsInfo()` as a table, with the raw response behind a
 *  disclosure. */
export function QuorumsTable({ data }: { data: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const { height, quorums } = normaliseQuorums(data);
  const groups = quorumBreakdown(quorums);

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="xs" color="gray.400">
        {quorums.length} active validator quorum{quorums.length === 1 ? '' : 's'}
        {height !== null ? ` at platform height ${height}` : ''}
        {groups.length > 0
          ? ` · ${groups.map((g) => `${g.count} × ${g.quorumType} (${g.memberCount ?? '?'} members)`).join(', ')}`
          : ''}
        .
      </Text>
      {quorums.length === 0 ? (
        <Text color="gray.400" fontSize="sm">
          No quorums reported.
        </Text>
      ) : (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th color="gray.400" borderColor="gray.750">
                  Quorum hash
                </Th>
                <Th color="gray.400" borderColor="gray.750">
                  Type
                </Th>
                <Th color="gray.400" borderColor="gray.750" isNumeric>
                  Members
                </Th>
                <Th color="gray.400" borderColor="gray.750" isNumeric>
                  Threshold
                </Th>
                <Th color="gray.400" borderColor="gray.750">
                  Verified
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {quorums.map((q) => (
                <Tr key={q.quorumHash}>
                  <Td borderColor="gray.750">
                    <Identifier value={q.quorumHash} avatar={false} copy dense highlight="last" />
                  </Td>
                  <Td borderColor="gray.750" fontFamily="mono" fontSize="xs">
                    <TypeLabel type={q.quorumType} />
                  </Td>
                  <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" isNumeric>
                    {q.memberCount ?? '—'}
                  </Td>
                  <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" isNumeric>
                    {q.threshold ?? '—'}
                  </Td>
                  <Td borderColor="gray.750" fontFamily="mono" fontSize="xs">
                    {q.isVerified === null ? '—' : q.isVerified ? 'yes' : 'no'}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
      <Box>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          {showRaw ? 'Hide raw response' : 'Show raw response'}
        </Button>
        <Collapse in={showRaw} animateOpacity>
          {showRaw ? <CodeBlock value={data ?? null} collapsedHeight={240} /> : null}
        </Collapse>
      </Box>
    </VStack>
  );
}
