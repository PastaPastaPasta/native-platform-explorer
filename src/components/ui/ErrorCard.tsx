'use client';

import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from './InfoBlock';

export function ErrorCard({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error: Error | null | undefined;
  onRetry?: () => void;
}) {
  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={3}>
        <HStack spacing={2} color="failed">
          <Text fontFamily="mono" fontSize="sm" lineHeight={1}>
            ∅
          </Text>
          <Heading as="h2" size="sm" color="failed" textTransform="uppercase" letterSpacing="0.06em">
            {title}
          </Heading>
        </HStack>
        <Text color="muted" fontSize="sm" fontFamily="mono">
          {error?.message ?? 'Unknown error.'}
        </Text>
        {onRetry ? (
          <Button size="sm" variant="outline" borderColor="hairlineStrong" color="ink" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </VStack>
    </InfoBlock>
  );
}
