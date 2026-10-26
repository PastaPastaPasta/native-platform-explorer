'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryStates } from 'nuqs';
import {
  Box,
  Button,
  Collapse,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { Pagination } from '@components/pagination/Pagination';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useVotePollsByEndDate } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';
import { isoDayParser, pageParser, pollWindowParser, type PollWindow } from '@util/url-state';

const PAGE_SIZE = 20;

const PRESETS: Array<{ key: PollWindow; label: string; days: number | null }> = [
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

function endMs(entry: unknown): number {
  const ms = readProp<bigint | number>(entry, 'timestampMs');
  return ms === undefined ? 0 : Number(ms);
}

function Content() {
  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Governance' },
    { label: 'Polls' },
  ]);
  usePageTitle('Vote polls');

  // Window, custom dates and page live in the URL so a view can be shared and
  // back/forward restores it. Custom dates default to the next 30 days.
  const [url, setUrl] = useQueryStates(
    { window: pollWindowParser, from: isoDayParser, to: isoDayParser, page: pageParser },
    { history: 'push' },
  );
  const preset: PollWindow = url.window ?? 'all-upcoming';
  const page = url.page ?? 1;
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  // The export's build time and locale differ from the visitor's. Initialize
  // dates after hydration, then keep them stable for the query cache key.
  const [nowMs, setNowMs] = useState<number>();
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const customStart = url.from ?? (nowMs === undefined ? '' : isoDate(nowMs));
  const customEnd = url.to ?? (nowMs === undefined ? '' : isoDate(nowMs + 30 * 86_400_000));

  const range = useMemo(() => {
    if (nowMs === undefined) return { start: undefined, end: undefined };
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

  // Don't query until the visitor's clock is known; an unfiltered first request would be wasted.
  const q = useVotePollsByEndDate(range.start, range.end, nowMs !== undefined);
  const polls = useMemo(() => {
    const list = Array.isArray(q.data) ? [...(q.data as unknown[])] : [];
    list.sort((a, b) => (order === 'asc' ? endMs(a) - endMs(b) : endMs(b) - endMs(a)));
    return list;
  }, [q.data, order]);
  const pageCount = Math.max(1, Math.ceil(polls.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount) - 1;
  const shown = polls.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

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
                  aria-pressed={preset === p.key}
                  onClick={() => {
                    void setUrl(p.key === 'custom'
                      ? { window: 'custom', from: customStart || null, to: customEnd || null, page: null }
                      : { window: p.key === 'all-upcoming' ? null : p.key, from: null, to: null, page: null });
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </HStack>
            <Collapse in={preset === 'custom'} animateOpacity>
              <Box pt={2}>
                <HStack spacing={2} flexWrap="wrap">
                  <Input
                    type="date"
                    size="sm"
                    aria-label="Polls ending from"
                    value={customStart}
                    onChange={(e) => void setUrl({ from: isoDayParser.parse(e.target.value), page: null }, { history: 'replace' })}
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
                    aria-label="Polls ending until"
                    value={customEnd}
                    onChange={(e) => void setUrl({ to: isoDayParser.parse(e.target.value), page: null }, { history: 'replace' })}
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
            <VStack align="stretch" spacing={3}>
              {polls.length > 1 ? (
                <HStack justify="space-between" flexWrap="wrap">
                  <Text fontSize="xs" color="muted">
                    {polls.length} end time{polls.length === 1 ? '' : 's'}
                  </Text>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Sort by end time, ${order === 'asc' ? 'soonest' : 'latest'} first`}
                    onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  >
                    Ends {order === 'asc' ? '↑ soonest first' : '↓ latest first'}
                  </Button>
                </HStack>
              ) : null}
              <VotePollsList entries={shown} />
              <Pagination
                pageIndex={pageIndex}
                pageCount={pageCount}
                onChange={(next) => void setUrl({ page: next === 0 ? null : next + 1 })}
              />
            </VStack>
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard lines={4} />}>
      <Content />
    </Suspense>
  );
}
