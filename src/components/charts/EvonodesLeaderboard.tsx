'use client';

import NextLink from 'next/link';
import { HStack, VStack, Text, Box } from '@chakra-ui/react';
import { Eyebrow } from '@ui/Eyebrow';

export interface EvonodeBar {
  proTxHash: string;
  blocks: number;
}

function Row({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <HStack
      {...(href ? { as: NextLink, href } : {})}
      spacing={4}
      px={2}
      py={2.5}
      borderBottom="1px solid"
      borderColor="hairline"
      _last={{ borderBottom: 'none' }}
      _hover={href ? { bg: 'sunken' } : undefined}
      transition="background 0.12s ease"
    >
      {children}
    </HStack>
  );
}

function Hash({ value, dim }: { value: string; dim?: boolean }) {
  const head = value.slice(0, 10);
  const tail = value.length > 16 ? value.slice(-6) : '';
  return (
    <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap">
      <Text as="span" color={dim ? 'muted' : 'ink'}>
        {head}
      </Text>
      {tail ? (
        <Text as="span" color="faint">
          …{tail}
        </Text>
      ) : null}
    </Text>
  );
}

/** Top-N block proposers for an epoch. Two readings of the same data:
 *  • Diverged — a ranked bar chart whose bars span the full width so small
 *    leads are actually visible, with the count called out at the end.
 *  • Tied (max === min, typical of a fresh epoch) — a plain roster; per-row
 *    counts/bars are dropped since they're identical and stated in the note. */
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
      <Text color="muted" fontSize="sm">
        {emptyLabel}
      </Text>
    );
  }

  const max = top.reduce((m, e) => Math.max(m, e.blocks), 0) || 1;
  const min = top.reduce((m, e) => Math.min(m, e.blocks), max);
  const total = top.reduce((s, e) => s + e.blocks, 0);
  const flat = max === min;

  if (flat) {
    return (
      <VStack align="stretch" spacing={0}>
        <Text fontSize="xs" color="muted" mb={2}>
          {top.length} proposer{top.length === 1 ? '' : 's'} shown, tied at {max} block
          {max === 1 ? '' : 's'} each — ranking emerges as the epoch fills.
        </Text>
        {top.map((e) => (
          <Row key={e.proTxHash} href={`/evonode/?proTxHash=${encodeURIComponent(e.proTxHash)}`}>
            <Box flexShrink={0} w="14px" textAlign="center">
              <Text as="span" color="faint" fontSize="xs">
                ·
              </Text>
            </Box>
            <Hash value={e.proTxHash} />
          </Row>
        ))}
      </VStack>
    );
  }

  return (
    <VStack align="stretch" spacing={0}>
      <Text fontSize="xs" color="muted" mb={1}>
        Top {top.length} proposer{top.length === 1 ? '' : 's'} · {total} block
        {total === 1 ? '' : 's'} shown.
      </Text>

      {/* Column header */}
      <HStack spacing={4} px={2} pb={1.5} borderBottom="1px solid" borderColor="hairline">
        <Box flexShrink={0} w="20px" />
        <Box w={{ base: 'auto', md: '190px' }} flexShrink={0}>
          <Eyebrow size="9px">Proposer</Eyebrow>
        </Box>
        <Box flex="1" />
        <Box minW="40px" textAlign="right">
          <Eyebrow size="9px">Blocks</Eyebrow>
        </Box>
      </HStack>

      {top.map((e, i) => {
        const rank = i + 1;
        const isTop = e.blocks === max;
        const pct = Math.max(2, Math.round((e.blocks / max) * 100));
        return (
          <Row key={e.proTxHash} href={`/evonode/?proTxHash=${encodeURIComponent(e.proTxHash)}`}>
            <Text
              flexShrink={0}
              w="20px"
              textAlign="right"
              fontFamily="mono"
              fontSize="xs"
              color={isTop ? 'accent' : 'muted'}
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {rank}
            </Text>

            <Box w={{ base: 'auto', md: '190px' }} flexShrink={0}>
              <Hash value={e.proTxHash} />
            </Box>

            {/* Share bar — spans the full remaining width so small leads read */}
            <Box
              display={{ base: 'none', sm: 'block' }}
              flex="1"
              minW={0}
              position="relative"
              height="8px"
              bg="sunken"
              borderRadius="badge"
            >
              <Box
                position="absolute"
                insetStart={0}
                top={0}
                bottom={0}
                width={`${pct}%`}
                bg="accent"
                opacity={isTop ? 1 : 0.5}
                borderRadius="badge"
              />
            </Box>

            <Text
              flexShrink={0}
              minW="40px"
              textAlign="right"
              fontFamily="mono"
              fontSize="sm"
              fontWeight={600}
              color={isTop ? 'ink' : 'muted'}
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {e.blocks}
            </Text>
          </Row>
        );
      })}
    </VStack>
  );
}
