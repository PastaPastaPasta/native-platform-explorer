'use client';

import { Box, Text, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { APP_VERSION } from '@/version';

export function Logotype() {
  return (
    <Box as={NextLink} href="/" display="inline-block" _hover={{ textDecoration: 'none' }}>
      <VStack align="flex-start" spacing="2px" lineHeight={1}>
        <Text
          fontFamily="mono"
          fontSize="sm"
          fontWeight={500}
          color="ink"
          letterSpacing="-0.01em"
        >
          native_explorer
        </Text>
        <Text
          fontFamily="mono"
          fontSize="10px"
          color="muted"
          letterSpacing="0.04em"
        >
          v{APP_VERSION} · client-only
        </Text>
      </VStack>
    </Box>
  );
}
