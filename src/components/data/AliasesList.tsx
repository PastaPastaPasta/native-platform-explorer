'use client';

import { VStack, Text } from '@chakra-ui/react';
import { Alias } from './Alias';

export function AliasesList({ names }: { names: string[] | undefined | null }) {
  if (!names || names.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        No DPNS names registered for this identity.
      </Text>
    );
  }
  return (
    <VStack align="flex-start" spacing={2}>
      {names.map((n) => (
        <Alias key={n} name={n} href={`/dpns/${encodeURIComponent(n)}/`} />
      ))}
    </VStack>
  );
}
