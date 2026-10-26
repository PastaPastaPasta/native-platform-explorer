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

/** rc.2 does not read the type or threshold from Platform: it maps the member
 *  count to a type and takes a fixed fraction of the count as threshold. */
export const INFERRED_NOTE =
  'Type and threshold are inferred by the SDK from the member count ' +
  '(50–70 → LLMQ_60_75, 90–110 → LLMQ_100_67, 350–450 → LLMQ_400_60, otherwise ' +
  'LLMQ_TYPE_UNKNOWN), and the threshold is that fraction of the members present, ' +
  'not the LLMQ type’s configured threshold. Platform does not report either.';

function TypeLabel({ type }: { type: string }) {
  return (
    <Text
      as="span"
      color={type === UNKNOWN_TYPE ? 'gray.400' : undefined}
      title={
        type === UNKNOWN_TYPE
          ? 'The SDK has no type for this member count'
          : 'Inferred by the SDK from the member count'
      }
    >
      {type}
    </Text>
  );
}

function InferredHeader({ children }: { children: React.ReactNode }) {
  return (
    <Text as="span" title={INFERRED_NOTE} cursor="help">
      {children}*
    </Text>
  );
}

/** Quorums grouped by size, with the SDK's inferred type and threshold. */
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
              {g.memberCount ?? '—'} members
            </Text>
            <Text fontFamily="mono" fontSize="11px" color="muted" title={INFERRED_NOTE}>
              inferred {g.quorumType} · threshold {g.threshold ?? '—'}
            </Text>
          </VStack>
          <Text fontFamily="mono" fontSize="lg" color="ink" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {g.count}
          </Text>
        </HStack>
      ))}
      <Text fontSize="11px" color="muted" pt={2}>
        {INFERRED_NOTE}
      </Text>
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
          ? ` · ${groups.map((g) => `${g.count} × ${g.memberCount ?? '?'} members`).join(', ')}`
          : ''}
        . The list is read without a proof.
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
                  <InferredHeader>Type</InferredHeader>
                </Th>
                <Th color="gray.400" borderColor="gray.750" isNumeric>
                  Members
                </Th>
                <Th color="gray.400" borderColor="gray.750" isNumeric>
                  <InferredHeader>Threshold</InferredHeader>
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
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Text fontSize="xs" color="gray.400" mt={2}>
            * {INFERRED_NOTE}
          </Text>
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
