'use client';

import { Container } from '@ui/Container';
import { EpochView } from '@components/epoch/EpochView';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentEpoch, useEvonodesBlocksByRange } from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';

export default function CurrentEpochPage() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Epoch' }]);

  const epochQ = useCurrentEpoch();
  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;
  const evonodesQ = useEvonodesBlocksByRange(epoch?.index, 100);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <EpochView
        epoch={epoch}
        epochQ={epochQ}
        evonodesQ={evonodesQ}
        leaderboardTitle="Top proposers this epoch"
        leaderboardLimit={20}
      />
    </Container>
  );
}
