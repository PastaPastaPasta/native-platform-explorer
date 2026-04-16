'use client';

import { Box, Heading, HStack, Progress, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { InfoLine } from '@components/data/InfoLine';
import { DateBlock } from '@components/data/DateBlock';
import { NotActive } from '@components/data/NotActive';

export interface EpochHeaderProps {
  index: number | bigint;
  startAt?: Date | number | bigint | null;
  endAt?: Date | number | bigint | null;
  progressPct?: number | null;
  firstBlockHeight?: number | bigint | null;
  feesCollected?: number | bigint | null;
}

export function EpochHeaderCard({
  index,
  startAt,
  endAt,
  progressPct,
  firstBlockHeight,
  feesCollected,
}: EpochHeaderProps) {
  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between" flexWrap="wrap" spacing={3}>
          <Heading size="md" color="gray.100">
            Epoch #{String(index)}
          </Heading>
          {progressPct !== null && progressPct !== undefined ? (
            <Text fontSize="xs" color="gray.400">
              {progressPct.toFixed(1)}% complete
            </Text>
          ) : null}
        </HStack>
        {progressPct !== null && progressPct !== undefined ? (
          <Progress
            value={progressPct}
            colorScheme="blue"
            size="sm"
            borderRadius="full"
            bg="gray.800"
          />
        ) : null}
        <Wrap spacing={8}>
          <WrapItem>
            <InfoLine label="Starts" value={<DateBlock value={startAt ?? null} />} />
          </WrapItem>
          <WrapItem>
            <InfoLine label="Ends" value={<DateBlock value={endAt ?? null} />} />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="First block"
              value={
                firstBlockHeight !== null && firstBlockHeight !== undefined ? (
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {String(firstBlockHeight)}
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Fees collected"
              value={
                feesCollected !== null && feesCollected !== undefined ? (
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {String(feesCollected)}
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
          </WrapItem>
        </Wrap>
      </VStack>
      <Box />
    </InfoBlock>
  );
}
