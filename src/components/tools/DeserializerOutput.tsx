'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { CodeBlock } from '@components/data/CodeBlock';

export function DeserializerError({ message }: { message: string }) {
  return (
    <HStack
      spacing={3}
      p={4}
      borderRadius="xl"
      border="1px solid"
      borderColor="rgba(244,88,88,0.2)"
      bg="rgba(244,88,88,0.05)"
    >
      <WarningIcon color="red.400" boxSize={4} flexShrink={0} />
      <Text fontSize="sm" color="red.300" lineHeight="1.5">
        {message}
      </Text>
    </HStack>
  );
}

export function DeserializerResult({ value }: { value: unknown }) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={2}>
        <CheckCircleIcon color="success" boxSize={3} />
        <Text fontSize="xs" color="gray.400" textTransform="uppercase" fontWeight={500} letterSpacing="0.06em">
          Deserialized output
        </Text>
      </HStack>
      <Box
        borderRadius="xl"
        border="1px solid"
        borderColor="rgba(0,141,228,0.15)"
        overflow="hidden"
      >
        <CodeBlock value={value} />
      </Box>
    </VStack>
  );
}
