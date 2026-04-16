'use client';

import { Box, Skeleton, VStack } from '@chakra-ui/react';
import { InfoBlock } from './InfoBlock';

export function LoadingCard({ lines = 4 }: { lines?: number }) {
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <Skeleton height="28px" width="60%" startColor="gray.800" endColor="gray.700" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height="16px"
            width={`${80 - i * 8}%`}
            startColor="gray.800"
            endColor="gray.700"
          />
        ))}
      </VStack>
      <Box mt={4} className="loading-line" />
    </InfoBlock>
  );
}
