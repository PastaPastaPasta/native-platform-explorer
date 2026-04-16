'use client';

import { Heading, VStack } from '@chakra-ui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { EpochHeaderCard } from '@components/epoch/EpochHeaderCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import type { NormalisedEpoch } from '@util/epoch';
import { evonodesMapToBars } from '@util/epoch';

export interface EpochViewProps {
  epoch: NormalisedEpoch | null;
  epochQ: Pick<UseQueryResult<unknown, Error>, 'isLoading' | 'isError' | 'error' | 'refetch'>;
  evonodesQ: Pick<UseQueryResult<unknown, Error>, 'isLoading' | 'isError' | 'error' | 'data' | 'refetch'>;
  leaderboardTitle: string;
  leaderboardLimit: number;
  notFound?: { title: string; description: string; actions: Array<{ label: string; href: string }> };
  fallbackIndex?: number;
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
}: EpochViewProps) {
  const bars = evonodesMapToBars(evonodesQ.data);

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
        />
      )}

      <InfoBlock>
        <Heading size="sm" color="gray.100" mb={3}>
          {leaderboardTitle}
        </Heading>
        {evonodesQ.isLoading ? (
          <LoadingCard lines={evonodesQ.isLoading ? 6 : 4} />
        ) : evonodesQ.isError ? (
          <ErrorCard error={evonodesQ.error} onRetry={() => evonodesQ.refetch()} />
        ) : (
          <EvonodesLeaderboard entries={bars} limit={leaderboardLimit} />
        )}
      </InfoBlock>
    </VStack>
  );
}
