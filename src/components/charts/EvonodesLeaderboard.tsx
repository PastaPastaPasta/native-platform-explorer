'use client';

import NextLink from 'next/link';
import { HStack, VStack, Text, Box } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';

export interface EvonodeBar {
  proTxHash: string;
  blocks: number;
}

/** Horizontal bar chart of [{ proTxHash, blocks }]. Responsive; pure CSS
 *  (no SVG) to avoid layout thrash on resize. Top-N items only.
 *
 *  When the counts have no meaningful variation (max < 2, typical of a
 *  just-started epoch where everyone has proposed 1 block) we render a
 *  compact list instead of all-100%-width bars — that would be accurate
 *  but visually misleading. */
export function EvonodesLeaderboard({
  entries,
  limit = 20,
  emptyLabel = 'No proposers yet this epoch.',
}: {
  entries: EvonodeBar[];
  limit?: number;
  emptyLabel?: string;
}) {
  const top = entries.slice(0, limit);
  if (top.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        {emptyLabel}
      </Text>
    );
  }
  const max = top.reduce((m, e) => Math.max(m, e.blocks), 0) || 1;
  const min = top.reduce((m, e) => Math.min(m, e.blocks), max);
  const flat = max === min || max < 2;

  if (flat) {
    return (
      <VStack align="stretch" spacing={1}>
        <Text fontSize="xs" color="gray.400" mb={1}>
          {top.length} proposer{top.length === 1 ? '' : 's'} so far; each has proposed
          {max === 1 ? ' 1 block.' : ` ${max} blocks.`} Ranking will appear once counts
          diverge.
        </Text>
        {top.map((e) => (
          <HStack
            key={e.proTxHash}
            as={NextLink}
            href={`/evonode/?proTxHash=${encodeURIComponent(e.proTxHash)}`}
            justify="space-between"
            spacing={3}
            _hover={{ bg: 'gray.800' }}
            borderRadius="md"
            px={2}
            py={1}
          >
            <Identifier value={e.proTxHash} avatar dense copy={false} />
            <Text fontSize="xs" fontFamily="mono" color="gray.250">
              {e.blocks} block{e.blocks === 1 ? '' : 's'}
            </Text>
          </HStack>
        ))}
      </VStack>
    );
  }

  return (
    <VStack align="stretch" spacing={1.5}>
      {top.map((e) => {
        const pct = Math.max(4, Math.round((e.blocks / max) * 100));
        return (
          <HStack
            key={e.proTxHash}
            as={NextLink}
            href={`/evonode/?proTxHash=${encodeURIComponent(e.proTxHash)}`}
            spacing={3}
            _hover={{ bg: 'gray.800' }}
            borderRadius="md"
            px={2}
            py={1}
          >
            <Box flexShrink={0} minW="140px">
              <Identifier value={e.proTxHash} avatar dense copy={false} />
            </Box>
            <Box flex="1" position="relative" height="14px" bg="gray.800" borderRadius="md">
              <Box
                position="absolute"
                inset="0"
                right="auto"
                width={`${pct}%`}
                bg="brand.normal"
                borderRadius="md"
                opacity={0.85}
              />
            </Box>
            <Text fontSize="xs" fontFamily="mono" color="gray.100" minW="60px" textAlign="right">
              {e.blocks}
            </Text>
          </HStack>
        );
      })}
    </VStack>
  );
}
