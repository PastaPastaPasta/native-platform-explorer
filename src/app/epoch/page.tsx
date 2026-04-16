'use client';

import { Heading, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { EpochHeaderCard } from '@components/epoch/EpochHeaderCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentEpoch, useEvonodesBlocksByRange } from '@sdk/queries';
import { evonodesMapToBars, normaliseEpoch } from '@util/epoch';

export default function CurrentEpochPage() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Epoch' }]);

  const epochQ = useCurrentEpoch();
  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;
  const evonodesQ = useEvonodesBlocksByRange(epoch?.index, 100);
  const bars = evonodesMapToBars(evonodesQ.data);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {epochQ.isLoading ? (
          <LoadingCard lines={4} />
        ) : epochQ.isError ? (
          <ErrorCard error={epochQ.error} onRetry={() => epochQ.refetch()} />
        ) : !epoch ? null : (
          <EpochHeaderCard
            index={epoch.index}
            startAt={epoch.startAtMs}
            endAt={epoch.endAtMs}
            progressPct={epoch.progressPct}
            firstBlockHeight={epoch.firstBlockHeight}
            feesCollected={epoch.feesCollected}
          />
        )}

        <InfoBlock>
          <Heading size="sm" color="gray.100" mb={3}>
            Top proposers this epoch
          </Heading>
          {evonodesQ.isLoading ? (
            <LoadingCard lines={6} />
          ) : evonodesQ.isError ? (
            <ErrorCard error={evonodesQ.error} onRetry={() => evonodesQ.refetch()} />
          ) : (
            <EvonodesLeaderboard entries={bars} limit={20} />
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
