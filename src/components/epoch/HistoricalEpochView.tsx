'use client';

import { Heading, Text, VStack } from '@chakra-ui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { EpochHeaderCard } from './EpochHeaderCard';
import { FinalizedEpochCard } from './FinalizedEpochCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { evonodesMapToBars, normaliseEpoch, normaliseFinalizedEpoch } from '@util/epoch';

type SourceQuery = Pick<UseQueryResult<unknown, Error>, 'status' | 'error' | 'data' | 'refetch'>;

/** Historical metadata and finalized totals are separate sources. A failure or
 * pending response from one source cannot hide an available record from another. */
export function HistoricalEpochView({ index, epochQ, finalizedQ, evonodesQ }: {
  index: number; epochQ: SourceQuery; finalizedQ: SourceQuery; evonodesQ: SourceQuery;
}) {
  const ordinaryEntry = epochQ.data instanceof Map ? epochQ.data.get(index) : undefined;
  const finalizedEntry = finalizedQ.data instanceof Map ? finalizedQ.data.get(index) : undefined;
  const headerEntry = ordinaryEntry ?? finalizedEntry;
  const metadata = headerEntry ? normaliseEpoch(headerEntry, index) : null;
  const finalized = finalizedEntry ? normaliseFinalizedEpoch(finalizedEntry) : null;
  const live = finalizedQ.status === 'success' && !finalized;

  if (!headerEntry && epochQ.status === 'success' && finalizedQ.status === 'success') {
    return <NotFoundCard title="Epoch not found" description={`No epoch #${index} on this network.`}
      actions={[{ label: 'Return to epochs', href: '/epoch/history/' }]} />;
  }

  return <VStack align="stretch" spacing={4}>
    {metadata ? <EpochHeaderCard index={metadata.index} startAt={metadata.startAtMs}
      endAt={metadata.endAtMs} progressPct={metadata.progressPct}
      firstBlockHeight={metadata.firstBlockHeight} feesCollected={metadata.feesCollected}
      showFeesCollected={metadata.feesCollected !== null} /> : null}

    {epochQ.status === 'pending' ? <InfoBlock>
      <Heading size="sm" mb={3}>Epoch metadata</Heading><LoadingCard lines={2} />
    </InfoBlock> : epochQ.status === 'error' ? <ErrorCard title="Epoch metadata unavailable"
      error={epochQ.error} onRetry={() => { void epochQ.refetch(); }} /> : !ordinaryEntry && finalized ?
      <InfoBlock><Text color="muted" fontSize="sm">Ordinary epoch metadata was not returned. The header uses finalized metadata.</Text></InfoBlock> : null}

    {finalized ? <FinalizedEpochCard epoch={finalized} /> : finalizedQ.status === 'pending' ? <InfoBlock>
      <Heading size="sm" mb={3}>Finalized epoch totals</Heading><LoadingCard lines={4} />
    </InfoBlock> : finalizedQ.status === 'error' ? <ErrorCard title="Finalized details unavailable"
      error={finalizedQ.error} onRetry={() => { void finalizedQ.refetch(); }} /> :
      <InfoBlock><Text color="muted" fontSize="sm">No finalized record was returned for this epoch.</Text></InfoBlock>}

    {finalized && finalizedQ.status === 'error' ? <ErrorCard title="Finalized refresh unavailable"
      error={finalizedQ.error} onRetry={() => { void finalizedQ.refetch(); }} /> : null}

    <InfoBlock>
      <Heading size="sm" color="gray.100" mb={3}>Proposers in this epoch</Heading>
      {finalized ? finalized.blockProposers ? <EvonodesLeaderboard
        entries={evonodesMapToBars(finalized.blockProposers)} limit={50}
        emptyLabel="No recorded proposers for this finalized epoch." /> :
        <ErrorCard title="Finalized proposers unavailable" error={new Error('The finalized record did not contain a proposer map.')}
          onRetry={() => { void finalizedQ.refetch(); }} /> : !live ?
        <Text color="muted" fontSize="sm">Waiting for finalized details before choosing the proposer source.</Text> :
        evonodesQ.status === 'pending' ? <LoadingCard lines={6} /> : evonodesQ.status === 'error' ?
        <ErrorCard title="Live proposers unavailable" error={evonodesQ.error}
          onRetry={() => { void evonodesQ.refetch(); }} /> :
        <EvonodesLeaderboard entries={evonodesMapToBars(evonodesQ.data)} limit={50} />}
    </InfoBlock>
  </VStack>;
}
