'use client';

import NextLink from 'next/link';
import { HStack, VStack, Text, Box } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';

export interface EvonodeBar {
  proTxHash: string;
  blocks: number;
}

/** Horizontal bar chart of [{ proTxHash, blocks }]. Responsive; pure CSS
 *  (no SVG) to avoid layout thrash on resize. Top-N items only. */
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

  return (
    <VStack align="stretch" spacing={1.5}>
      {top.map((e) => {
        const pct = Math.max(2, Math.round((e.blocks / max) * 100));
        return (
          <HStack
            key={e.proTxHash}
            as={NextLink}
            href={`/evonode/${e.proTxHash}/`}
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
