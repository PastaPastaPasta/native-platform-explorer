'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { HistoricalEpochView } from '@components/epoch/HistoricalEpochView';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useEpochInfo, useEvonodesBlocksByRange, useFinalizedEpochInfo } from '@sdk/queries';
import { isEpochIndex, MAX_EPOCH_INDEX } from '@sdk/epoch-queries';

function Content() {
  const params = useSearchParams();
  const raw = params.get('index') ?? '';
  const idx = Number(raw);
  const valid = raw.trim() !== '' && isEpochIndex(idx);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Epoch', href: '/epoch/' },
    { label: raw ? `#${raw}` : '—' },
  ]);

  const epochQ = useEpochInfo(valid ? idx : undefined);
  const finalizedQ = useFinalizedEpochInfo(valid ? idx : undefined);
  const finalizedEntry = finalizedQ.data instanceof Map ? finalizedQ.data.get(idx) : undefined;
  // Finalized proposers are authoritative. Only query the live source once a
  // successful finalized lookup confirms that there is no finalized record.
  const liveIndex = valid && finalizedQ.status === 'success' && !finalizedEntry ? idx : undefined;
  const evonodesQ = useEvonodesBlocksByRange(liveIndex, 100);

  if (!valid) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide a whole epoch index from 0 to {MAX_EPOCH_INDEX} as <code>?index=…</code>.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <HistoricalEpochView
        index={idx}
        epochQ={epochQ}
        finalizedQ={finalizedQ}
        evonodesQ={evonodesQ}
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
