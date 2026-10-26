'use client';

import { Container } from '@ui/Container';
import { EpochView } from '@components/epoch/EpochView';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
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

  return (
    <Container py={{ base: 4, md: 6 }}>
      <EpochView
        epoch={epoch}
        epochQ={epochQ}
        evonodesQ={evonodesQ}
        leaderboardTitle="Top proposers this epoch"
        leaderboardLimit={20}
        endEstimated
      />
    </Container>
  );
}
