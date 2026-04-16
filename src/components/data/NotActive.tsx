'use client';

import { Text } from '@chakra-ui/react';

export function NotActive({ label = '—' }: { label?: string }) {
  return (
    <Text as="span" color="gray.400" fontFamily="mono">
      {label}
    </Text>
  );
}
