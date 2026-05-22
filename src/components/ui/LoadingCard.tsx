'use client';

import { Box, Skeleton, VStack } from '@chakra-ui/react';
import { InfoBlock } from './InfoBlock';

export function LoadingCard({ lines = 4 }: { lines?: number }) {
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <Skeleton
          height="22px"
          width="40%"
          startColor="sunken"
          endColor="raised"
          borderRadius="badge"
        />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height="12px"
            width={`${78 - i * 8}%`}
            startColor="sunken"
            endColor="raised"
            borderRadius="badge"
          />
        ))}
      </VStack>
      <Box mt={4} className="loading-line" />
    </InfoBlock>
  );
}
