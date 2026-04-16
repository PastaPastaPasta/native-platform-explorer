'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export interface InfoLineProps {
  label: ReactNode;
  value: ReactNode;
  inline?: boolean;
  description?: ReactNode;
}

export function InfoLine({ label, value, inline = false, description }: InfoLineProps) {
  if (inline) {
    return (
      <HStack justify="space-between" align="center" py={1.5} spacing={4}>
        <Text fontSize="xs" color="gray.250" fontWeight={500} textTransform="uppercase" letterSpacing="wide">
          {label}
        </Text>
        <Box>{value}</Box>
      </HStack>
    );
  }
  return (
    <VStack align="flex-start" spacing={1} py={2}>
      <Text fontSize="xs" color="gray.250" fontWeight={500} textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
      {description ? (
        <Text fontSize="xs" color="gray.400">
          {description}
        </Text>
      ) : null}
      <Box>{value}</Box>
    </VStack>
  );
}
