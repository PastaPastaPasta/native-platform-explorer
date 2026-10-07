'use client';

import { Heading, Text, Wrap, WrapItem } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { InfoLine } from '@components/data/InfoLine';
import { NotActive } from '@components/data/NotActive';
import type { NormalisedFinalizedEpoch } from '@util/epoch';

export function FinalizedEpochCard({ epoch }: { epoch: NormalisedFinalizedEpoch }) {
  const fields = [
    ['Total blocks', epoch.totalBlocks],
    ['Protocol version', epoch.protocolVersion],
    ['Processing fees (credits)', epoch.processingFees],
    ['Storage fees distributed (credits)', epoch.distributedStorageFees],
    ['Storage fees created (credits)', epoch.createdStorageFees],
    ['Core block rewards (credits)', epoch.coreBlockRewards],
  ] as const;
  return <InfoBlock>
    <Heading size="sm" color="gray.100" mb={3}>Finalized epoch totals</Heading>
    <Wrap spacing={8}>
      {fields.map(([label, value]) => <WrapItem key={label}>
        <InfoLine label={label} value={value !== null
          ? <Text fontFamily="mono" fontSize="sm" color="gray.100">{String(value)}</Text>
          : <NotActive />} />
      </WrapItem>)}
    </Wrap>
  </InfoBlock>;
}
