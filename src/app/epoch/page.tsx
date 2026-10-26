'use client';

import { VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { EpochView } from '@components/epoch/EpochView';
import { EpochNav } from '@components/epoch/EpochNav';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useAllEvonodeBlocksInEpoch, useCurrentEpoch } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { normaliseEpoch, withEpochDuration } from '@util/epoch';
import { networkEpochDurationMs } from '@sdk/current-epoch';

export default function CurrentEpochPage() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Epoch' }]);

  const { network } = useSdk();
  const epochQ = useCurrentEpoch();
  const epoch = epochQ.data
    ? withEpochDuration(normaliseEpoch(epochQ.data), networkEpochDurationMs(network))
    : null;
  const evonodesQ = useAllEvonodeBlocksInEpoch(epoch?.index);
  usePageTitle(epoch ? `Current epoch #${epoch.index}` : 'Current epoch');

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <EpochNav index={epoch?.index} currentIndex={epoch?.index} />
        <EpochView
          epoch={epoch}
          epochQ={epochQ}
          evonodesQ={evonodesQ}
          leaderboardTitle="Top proposers this epoch"
          leaderboardLimit={20}
          endEstimated
        />
      </VStack>
    </Container>
  );
}
