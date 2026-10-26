'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { HistoricalEpochView } from '@components/epoch/HistoricalEpochView';
import { EpochNav } from '@components/epoch/EpochNav';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useAllEvonodeBlocksInEpoch, useCurrentEpoch, useEpochInfo, useFinalizedEpochInfo } from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';
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
  usePageTitle(valid ? `Epoch #${idx}` : 'Epoch');

  const epochQ = useEpochInfo(valid ? idx : undefined);
  const finalizedQ = useFinalizedEpochInfo(valid ? idx : undefined);
  const finalizedEntry = finalizedQ.data instanceof Map ? finalizedQ.data.get(idx) : undefined;
  // Finalized proposers are authoritative. Only query the live source once a
  // successful finalized lookup confirms that there is no finalized record.
  const liveIndex = valid && finalizedQ.status === 'success' && !finalizedEntry ? idx : undefined;
  const evonodesQ = useAllEvonodeBlocksInEpoch(liveIndex);
  const currentQ = useCurrentEpoch();
  const currentIndex = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;

  if (!valid) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">Epoch lookup</Heading>
            {raw.trim() ? (
              <Text role="alert" fontSize="sm" color="failed">
                &ldquo;{raw.trim()}&rdquo; is not an epoch index.
              </Text>
            ) : null}
            <LookupInput
              label="Epoch index"
              placeholder={currentIndex !== undefined ? `0–${currentIndex}` : 'e.g. 42'}
              description={`A whole number from 0 to ${MAX_EPOCH_INDEX}.`}
              validate={(v) => (/^\d+$/.test(v) && isEpochIndex(Number(v)) ? null : `Expected a whole number from 0 to ${MAX_EPOCH_INDEX}.`)}
              buildHref={(v) => `/epoch/detail/?index=${Number(v)}`}
            />
            <EpochNav index={currentIndex} currentIndex={currentIndex} />
          </VStack>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <EpochNav index={idx} currentIndex={currentIndex} />
        <HistoricalEpochView
          index={idx}
          epochQ={epochQ}
          finalizedQ={finalizedQ}
          evonodesQ={evonodesQ}
        />
      </VStack>
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
