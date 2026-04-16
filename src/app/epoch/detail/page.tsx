'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { EpochView } from '@components/epoch/EpochView';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useEpochInfo, useEvonodesBlocksByRange, useFinalizedEpochInfo } from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';

function Content() {
  const params = useSearchParams();
  const raw = params.get('index') ?? '';
  const idx = Number(raw);
  const valid = Number.isFinite(idx) && idx >= 0;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Epoch', href: '/epoch/' },
    { label: raw ? `#${raw}` : '—' },
  ]);

  const epochQ = useEpochInfo(valid ? idx : undefined);
  const finalizedQ = useFinalizedEpochInfo(valid ? idx : undefined);
  const evonodesQ = useEvonodesBlocksByRange(valid ? idx : undefined, 100);

  const mapData = epochQ.data as Map<unknown, unknown> | null | undefined;
  const fallback = finalizedQ.data as Map<unknown, unknown> | null | undefined;
  const raws = [...(mapData?.values() ?? []), ...(fallback?.values() ?? [])].filter(Boolean);
  const epochEntry = raws[0];
  const epoch = epochEntry ? normaliseEpoch(epochEntry) : null;

  if (!valid) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide an epoch index as <code>?index=…</code>.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <EpochView
        epoch={epoch}
        epochQ={epochQ}
        evonodesQ={evonodesQ}
        leaderboardTitle="Proposers in this epoch"
        leaderboardLimit={50}
        fallbackIndex={idx}
        notFound={{
          title: 'Epoch not found',
          description: `No epoch #${idx} on this network.`,
          actions: [{ label: 'Return to epochs', href: '/epoch/history/' }],
        }}
      />
    </Container>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
