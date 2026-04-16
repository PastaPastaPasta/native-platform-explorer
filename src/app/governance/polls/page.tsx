'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Heading,
  HStack,
  Input,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useVotePollsByEndDate } from '@sdk/queries';

type PresetKey = '24h' | '7d' | '30d' | '90d' | 'all-upcoming' | 'custom';

const PRESETS: Array<{ key: PresetKey; label: string; days: number | null }> = [
  { key: '24h', label: 'Next 24 h', days: 1 },
  { key: '7d', label: 'Next 7 d', days: 7 },
  { key: '30d', label: 'Next 30 d', days: 30 },
  { key: '90d', label: 'Next 90 d', days: 90 },
  { key: 'all-upcoming', label: 'All upcoming', days: null },
  { key: 'custom', label: 'Custom…', days: null },
];

function dateInputToMs(input: string): number | undefined {
  if (!input) return undefined;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : undefined;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function bucketHour(ms: number | undefined): number | undefined {
  return ms === undefined ? undefined : Math.floor(ms / 3_600_000) * 3_600_000;
}

export default function Page() {
  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Governance' },
    { label: 'Polls' },
  ]);

  const [preset, setPreset] = useState<PresetKey>('30d');
  // Memoised to a stable render so the React Query cache key isn't churning.
  const nowMs = useMemo(() => Date.now(), []);
  const [customStart, setCustomStart] = useState<string>(isoDate(nowMs));
  const [customEnd, setCustomEnd] = useState<string>(
    isoDate(nowMs + 30 * 86_400_000),
  );
  const custom = useDisclosure({ defaultIsOpen: false });

  const range = useMemo(() => {
    if (preset === 'custom') {
      return {
        start: bucketHour(dateInputToMs(customStart)),
        end: bucketHour(dateInputToMs(customEnd)),
      };
    }
    const p = PRESETS.find((x) => x.key === preset);
    // Bucket 'now' to the minute so rapid re-renders don't thrash the cache key.
    const start = Math.floor(nowMs / 60_000) * 60_000;
    if (preset === 'all-upcoming' || !p?.days) return { start, end: undefined };
    return { start, end: start + p.days * 86_400_000 };
  }, [preset, customStart, customEnd, nowMs]);

  const q = useVotePollsByEndDate(range.start, range.end);
  const polls = (q.data as unknown[] | undefined) ?? [];

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              Vote polls
            </Heading>
            <Text fontSize="xs" color="gray.400" maxW="60ch">
              Polls whose end date falls in the selected window. Past polls
              (already ended) are not returned by the SDK — this view is
              upcoming-only.
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="xs"
                  variant={preset === p.key ? 'solid' : 'outline'}
                  colorScheme="blue"
                  onClick={() => {
                    setPreset(p.key);
                    if (p.key === 'custom') custom.onOpen();
                    else custom.onClose();
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </HStack>
            <Collapse in={custom.isOpen} animateOpacity>
              <Box pt={2}>
                <HStack spacing={2} flexWrap="wrap">
                  <Input
                    type="date"
                    size="sm"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    bg="gray.800"
                    borderColor="gray.700"
                    width="180px"
                  />
                  <Text fontSize="xs" color="gray.400">
                    →
                  </Text>
                  <Input
                    type="date"
                    size="sm"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    bg="gray.800"
                    borderColor="gray.700"
                    width="180px"
                  />
                </HStack>
              </Box>
            </Collapse>
            <Text fontSize="xs" color="gray.500">
              Querying{' '}
              {range.start !== undefined
                ? new Date(range.start).toLocaleString()
                : '—'}{' '}
              →{' '}
              {range.end !== undefined
                ? new Date(range.end).toLocaleString()
                : 'no upper bound'}
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {q.isLoading ? (
            <LoadingCard lines={4} />
          ) : q.isError ? (
            <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <VotePollsList entries={polls} />
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
