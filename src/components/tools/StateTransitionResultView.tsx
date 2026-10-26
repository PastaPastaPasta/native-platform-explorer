'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Heading,
  HStack,
  Spinner,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { InfoLine } from '@components/data/InfoLine';
import { STATE_TRANSITION_WAIT_MS, StateTransitionWaitTimeout } from '@sdk/queries';
import { isHex64 } from '@util/identifier';
import { readProp } from '@util/sdk-shape';

export function validateStateTransitionHash(value: string): string | null {
  return isHex64(value) ? null : 'Expected a 64-character hex hash.';
}

export interface StateTransitionSummary {
  status: string | null;
  hash: string | null;
  error: string | null;
}

/** rc.2 `StateTransitionResult` exposes `status`, `state_transition_hash`
 *  and an optional `error`; read them defensively from the WASM object or
 *  its JSON form. */
export function summariseStateTransitionResult(data: unknown): StateTransitionSummary {
  const read = (key: string) => {
    const value = readProp<unknown>(data, key);
    return typeof value === 'string' && value.trim() ? value : null;
  };
  return {
    status: read('status'),
    hash: read('state_transition_hash') ?? read('stateTransitionHash'),
    error: read('error'),
  };
}

function statusScheme(summary: StateTransitionSummary): string {
  if (summary.error) return 'red';
  if (summary.status && /success|executed|ok/i.test(summary.status)) return 'green';
  return 'gray';
}

function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!running) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  return elapsed;
}

type ResultQuery = Pick<UseQueryResult<unknown, Error>, 'data' | 'error' | 'isError' | 'isFetching' | 'isLoading' | 'refetch'>;

/** Waiting state, timeout and structured result for a state transition lookup. */
export function StateTransitionResultView({ query }: { query: ResultQuery }) {
  const raw = useDisclosure();
  const refetch = () => { void query.refetch(); };
  const waiting = query.isLoading || (query.isFetching && query.data === undefined);
  const elapsed = useElapsedSeconds(waiting);

  if (waiting) {
    return (
      <InfoBlock>
        <HStack spacing={3}>
          <Spinner size="sm" color="accent" />
          <VStack align="start" spacing={0}>
            {/* Only the static sentence is announced; the counter updates every second. */}
            <Text fontSize="sm">
              <span role="status">Waiting for Platform to report the result…</span>{' '}
              <span aria-hidden>{elapsed} s</span>
            </Text>
            <Text fontSize="xs" color="muted">
              Gives up after {STATE_TRANSITION_WAIT_MS / 1000} s. A transition that is still pending,
              was never broadcast, or executed long ago may not return a result.
            </Text>
          </VStack>
        </HStack>
      </InfoBlock>
    );
  }

  if (query.isError) {
    const timedOut = query.error instanceof StateTransitionWaitTimeout;
    return (
      <ErrorCard
        title={timedOut ? 'No result yet' : 'Lookup failed'}
        error={query.error}
        onRetry={refetch}
      />
    );
  }

  if (!query.data) {
    return (
      <InfoBlock>
        <VStack align="start" spacing={2}>
          <Text fontSize="sm">Platform returned no result for this hash yet.</Text>
          <Button size="sm" variant="outline" onClick={refetch}>Retry</Button>
        </VStack>
      </InfoBlock>
    );
  }

  const summary = summariseStateTransitionResult(query.data);
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <Heading size="sm" color="gray.100">Result</Heading>
        <InfoLine
          label="Status"
          value={<Badge colorScheme={statusScheme(summary)} textTransform="none">{summary.status ?? 'unknown'}</Badge>}
        />
        {summary.error ? (
          <InfoLine label="Error" value={<Text fontSize="sm" color="failed" wordBreak="break-word">{summary.error}</Text>} />
        ) : null}
        {summary.hash ? (
          <InfoLine label="Reported hash" value={<Text fontFamily="mono" fontSize="xs" wordBreak="break-all">{summary.hash}</Text>} />
        ) : null}
        <HStack spacing={2}>
          <Button size="sm" variant="outline" onClick={refetch} isLoading={query.isFetching}>
            Refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={raw.onToggle} aria-expanded={raw.isOpen}>
            {raw.isOpen ? 'Hide raw response' : 'Show raw response'}
          </Button>
        </HStack>
        {raw.isOpen ? <CodeBlock value={query.data} /> : null}
      </VStack>
    </InfoBlock>
  );
}
