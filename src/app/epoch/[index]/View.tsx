'use client';

import { useParams } from 'next/navigation';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { EpochHeaderCard } from '@components/epoch/EpochHeaderCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useEpochInfo, useEvonodesBlocksByRange, useFinalizedEpochInfo } from '@sdk/queries';
import { evonodesMapToBars, normaliseEpoch } from '@util/epoch';

export default function View({ index: fromServer }: { index: string }) {
  const p = useParams<{ index: string }>();
  const raw = p?.index ?? fromServer;
  const idx = Number(raw);
  const valid = Number.isFinite(idx) && idx >= 0;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Epoch', href: '/epoch/' },
    { label: `#${raw}` },
  ]);

  const epochQ = useEpochInfo(valid ? idx : undefined);
  const finalizedQ = useFinalizedEpochInfo(valid ? idx : undefined);
  const evonodesQ = useEvonodesBlocksByRange(valid ? idx : undefined, 100);

  const mapData = epochQ.data as Map<unknown, unknown> | null | undefined;
  const fallback = finalizedQ.data as Map<unknown, unknown> | null | undefined;
  const raws = [...(mapData?.values() ?? []), ...(fallback?.values() ?? [])].filter(Boolean);
  const epochEntry = raws[0];
  const epoch = epochEntry ? normaliseEpoch(epochEntry) : null;
  const bars = evonodesMapToBars(evonodesQ.data);

  if (!valid) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Invalid epoch index.</Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {epochQ.isLoading ? (
          <LoadingCard lines={4} />
        ) : epochQ.isError ? (
          <ErrorCard error={epochQ.error} onRetry={() => epochQ.refetch()} />
        ) : !epoch ? (
          <NotFoundCard
            title="Epoch not found"
            description={`No epoch #${idx} on this network.`}
            actions={[{ label: 'Return to epochs', href: '/epoch/history/' }]}
          />
        ) : (
          <EpochHeaderCard
            index={epoch.index || idx}
            startAt={epoch.startAtMs}
            endAt={epoch.endAtMs}
            progressPct={epoch.progressPct}
            firstBlockHeight={epoch.firstBlockHeight}
            feesCollected={epoch.feesCollected}
          />
        )}

        <InfoBlock>
          <Heading size="sm" color="gray.100" mb={3}>
            Proposers in this epoch
          </Heading>
          {evonodesQ.isLoading ? (
            <LoadingCard lines={4} />
          ) : (
            <EvonodesLeaderboard entries={bars} limit={50} />
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
