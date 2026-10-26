'use client';

import NextLink from 'next/link';
import { Button, HStack, VStack, Text, Box } from '@chakra-ui/react';
import { Eyebrow } from '@ui/Eyebrow';
import { useSortState, useSortedRows, type SortDirection } from '@components/data/SortableTh';

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

type LeaderboardSort = 'blocks' | 'proposer';

function SortHeader({ column, label, sort, onSort, firstDirection }: {
  column: LeaderboardSort;
  label: string;
  sort: { key: LeaderboardSort; direction: SortDirection };
  onSort: (key: LeaderboardSort, first?: SortDirection) => void;
  firstDirection: SortDirection;
}) {
  const active = sort.key === column;
  const arrow = active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <Button
      variant="unstyled"
      size="xs"
      height="auto"
      minW={0}
      aria-label={`Sort by ${label.toLowerCase()}${active ? `, ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      aria-pressed={active}
      onClick={() => onSort(column, firstDirection)}
    >
      <Eyebrow size="9px">{label}{arrow}</Eyebrow>
    </Button>
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

/** Top-N block proposers for an epoch. `entries` must be every proposer,
 *  ranked; the note states totals over all of them, not just the rows shown.
 *  Two readings of the same data:
 *  • Diverged — a ranked bar chart whose bars span the full width so small
 *    leads are actually visible, with the count called out at the end.
 *  • Tied (every proposer equal, typical of a fresh epoch) — a plain roster;
 *    per-row counts/bars are dropped since they're identical and stated in
 *    the note. */
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
  const { sort, toggle } = useSortState<LeaderboardSort>({ key: 'blocks', direction: 'desc' });
  const ranked = top.map((e, i) => ({ ...e, position: i }));
  const sorted = useSortedRows(ranked, sort, {
    blocks: (e) => e.blocks,
    proposer: (e) => e.proTxHash,
  });
  if (top.length === 0) {
    return (
      <Text color="muted" fontSize="sm">
        {emptyLabel}
      </Text>
    );
  }

  const max = top.reduce((m, e) => Math.max(m, e.blocks), 0) || 1;
  const min = entries.reduce((m, e) => Math.min(m, e.blocks), max);
  const total = entries.reduce((s, e) => s + e.blocks, 0);
  const flat = max === min;
  // Competition rank, as on /evonode/: 1 + proposers with strictly more
  // blocks. Entries are sorted by blocks, so a tie repeats the rank above.
  const ranks: number[] = [];
  top.forEach((e, i) => {
    ranks.push(i > 0 && e.blocks === top[i - 1]!.blocks ? ranks[i - 1]! : i + 1);
  });
  const shown =
    top.length < entries.length
      ? `${top.length} of ${entries.length} proposers`
      : `${entries.length} proposer${entries.length === 1 ? '' : 's'}`;

  if (flat) {
    return (
      <VStack align="stretch" spacing={0}>
        <Text fontSize="xs" color="muted" mb={2}>
          {shown} shown, all tied at {max} block{max === 1 ? '' : 's'} each — ranking
          emerges as the epoch fills.
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
        Top {shown} · {total.toLocaleString('en-US')} block{total === 1 ? '' : 's'} proposed
        in total.
      </Text>

      {/* Column header */}
      <HStack spacing={4} px={2} pb={1.5} borderBottom="1px solid" borderColor="hairline">
        <Box flexShrink={0} w="20px" />
        <Box w={{ base: 'auto', md: '190px' }} flexShrink={0}>
          <SortHeader column="proposer" label="Proposer" sort={sort} onSort={toggle} firstDirection="asc" />
        </Box>
        <Box flex="1" />
        <Box minW="40px" textAlign="right">
          <SortHeader column="blocks" label="Blocks" sort={sort} onSort={toggle} firstDirection="desc" />
        </Box>
      </HStack>

      {sorted.map((e) => {
        const rank = ranks[e.position];
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
