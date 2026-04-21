'use client';

import { Text, VStack } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';

export function DeserializerError({ message }: { message: string }) {
  return (
    <Text
      fontSize="sm"
      color="red.300"
      p={3}
      bg="red.900"
      borderRadius="md"
      border="1px solid"
      borderColor="red.700"
    >
      {message}
    </Text>
  );
}

export function DeserializerResult({ value }: { value: unknown }) {
  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="xs" color="gray.400" textTransform="uppercase">
        Deserialized output
      </Text>
      <CodeBlock value={value} />
    </VStack>
  );
}
