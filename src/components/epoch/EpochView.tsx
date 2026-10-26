'use client';

import { Heading, HStack, Text, VStack } from '@chakra-ui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { EpochHeaderCard } from '@components/epoch/EpochHeaderCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import type { NormalisedEpoch } from '@util/epoch';
import { summariseProposers } from '@util/epoch';

export interface EpochViewProps {
  epoch: NormalisedEpoch | null;
  epochQ: Pick<UseQueryResult<unknown, Error>, 'isLoading' | 'isError' | 'error' | 'refetch'>;
  /** Every proposer in the epoch (the full paginated walk), not one page. */
  evonodesQ: Pick<UseQueryResult<unknown, Error>, 'isLoading' | 'isError' | 'error' | 'data' | 'refetch'>;
  leaderboardTitle: string;
  leaderboardLimit: number;
  notFound?: { title: string; description: string; actions: Array<{ label: string; href: string }> };
  fallbackIndex?: number;
  endEstimated?: boolean;
}

/** Shared body for current-epoch and specific-epoch pages. */
export function EpochView({
  epoch,
  epochQ,
  evonodesQ,
  leaderboardTitle,
  leaderboardLimit,
  notFound,
  fallbackIndex,
  endEstimated,
}: EpochViewProps) {
  const proposers = summariseProposers(evonodesQ.data);

  return (
    <VStack align="stretch" spacing={4}>
      {epochQ.isLoading ? (
        <LoadingCard lines={4} />
      ) : epochQ.isError ? (
        <ErrorCard error={epochQ.error} onRetry={() => epochQ.refetch()} />
      ) : !epoch ? (
        notFound ? <NotFoundCard {...notFound} /> : null
      ) : (
        <EpochHeaderCard
          index={epoch.index || fallbackIndex || 0}
          startAt={epoch.startAtMs}
          endAt={epoch.endAtMs}
          progressPct={epoch.progressPct}
          firstBlockHeight={epoch.firstBlockHeight}
          feesCollected={epoch.feesCollected}
          endEstimated={endEstimated}
        />
      )}

      <InfoBlock>
        <HStack justify="space-between" align="baseline" flexWrap="wrap" mb={3}>
          <Heading size="sm" color="gray.100">
            {leaderboardTitle}
          </Heading>
          {/* A disabled walk (epoch unknown or failed) is neither loading nor
              errored, so require data rather than infer it. */}
          {evonodesQ.data instanceof Map && !evonodesQ.isError ? (
            <Text fontSize="xs" color="muted" fontFamily="mono">
              {proposers.totalBlocks.toLocaleString('en-US')} blocks ·{' '}
              {proposers.proposers.toLocaleString('en-US')} evonodes
            </Text>
          ) : null}
        </HStack>
        {epochQ.isLoading || evonodesQ.isLoading ? (
          <VStack align="stretch" spacing={2}>
            <Text fontSize="xs" color="muted">
              Reading every evonode&apos;s block count before ranking…
            </Text>
            <LoadingCard lines={6} />
          </VStack>
        ) : evonodesQ.isError ? (
          <ErrorCard error={evonodesQ.error} onRetry={() => evonodesQ.refetch()} />
        ) : (
          <EvonodesLeaderboard entries={proposers.bars} limit={leaderboardLimit} />
        )}
      </InfoBlock>
    </VStack>
  );
}
