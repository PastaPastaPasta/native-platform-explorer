'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { Container } from '@ui/Container';
import { useSdk } from '@sdk/hooks';
import { APP_VERSION } from '@/version';

function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Text as="span" fontFamily="mono" fontSize="xs" color="gray.250">
      {now ? now.toLocaleTimeString([], { hour12: false }) : '—'}
    </Text>
  );
}

export function Footer() {
  const { trusted, status } = useSdk();
  const proofsOn = trusted && status === 'ready';

  return (
    <Box
      as="footer"
      borderTop="1px solid"
      borderColor="whiteAlpha.100"
      bg="rgba(35,44,48,0.6)"
      sx={{ backdropFilter: 'blur(44px)' }}
      mt="auto"
      display={{ base: 'none', md: 'block' }}
    >
      <Container py={4}>
        <HStack justify="space-between" spacing={4} flexWrap="wrap">
          <HStack spacing={4}>
            <LocalClock />
            <Text fontSize="xs" color="gray.400">
              v{APP_VERSION}
            </Text>
            <Text
              as={NextLink}
              href="https://github.com/"
              fontSize="xs"
              color="gray.250"
              _hover={{ color: 'brand.light' }}
            >
              GitHub
            </Text>
          </HStack>
          <HStack spacing={3}>
            <Text fontSize="xs" color={proofsOn ? 'success' : 'gray.400'}>
              {proofsOn ? 'Proofs ON' : 'Proofs OFF'}
            </Text>
            <Text fontSize="xs" color="gray.400">
              Dash Platform · SDK-only
            </Text>
          </HStack>
        </HStack>
      </Container>
    </Box>
  );
}
