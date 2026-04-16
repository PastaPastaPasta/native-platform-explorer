'use client';

import { Button, Heading, Text, VStack } from '@chakra-ui/react';
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
        <Heading as="h2" size="md" color="danger">
          {title}
        </Heading>
        <Text color="gray.250" fontSize="sm">
          {error?.message ?? 'Unknown error.'}
        </Text>
        {onRetry ? (
          <Button size="sm" colorScheme="blue" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </VStack>
    </InfoBlock>
  );
}
