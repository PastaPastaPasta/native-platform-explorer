'use client';

import { Box, Button, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { useSdk } from '@sdk/hooks';
import { useQueryProofStore } from '@/contexts/QueryProofStore';
import { APP_VERSION } from '@/version';

function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Text as="span" fontFamily="mono" fontSize="xs" color="muted">
      {now ? now.toLocaleTimeString([], { hour12: false }) : '—'}
    </Text>
  );
}

export function Footer() {
  const { trusted, status } = useSdk();
  const { entries, enabled: inspectorEnabled, openDrawer } = useQueryProofStore();
  const proofsOn = trusted && status === 'ready';

  return (
    <Box
      as="footer"
      borderTop="1px solid"
      borderColor="hairline"
      bg="bg"
      mt="auto"
      display={{ base: 'none', md: 'block' }}
      px={{ base: 4, md: 6, xl: 8 }}
    >
      <HStack justify="space-between" spacing={4} flexWrap="wrap" py={3}>
        <HStack spacing={4}>
          <LocalClock />
          <Text fontFamily="mono" fontSize="xs" color="muted">
            v{APP_VERSION}
          </Text>
          <Text
            as={NextLink}
            href="https://github.com/"
            fontFamily="mono"
            fontSize="xs"
            color="muted"
            _hover={{ color: 'accent' }}
          >
            github
          </Text>
        </HStack>
        <HStack spacing={3}>
          <HStack spacing={1.5}>
            <Text
              as="span"
              fontSize="9px"
              color={proofsOn ? 'verified' : 'trusted'}
              lineHeight={1}
            >
              ●
            </Text>
            <Text fontFamily="mono" fontSize="xs" color="muted">
              proofs {proofsOn ? 'on' : 'off'}
            </Text>
          </HStack>
          {inspectorEnabled ? (
            <Button
              variant="link"
              fontFamily="mono"
              fontSize="xs"
              fontWeight="normal"
              color="muted"
              _hover={{ color: 'accent', textDecoration: 'none' }}
              onClick={openDrawer}
              title="Open Query Inspector (Cmd+Shift+P)"
            >
              {entries.length} {entries.length === 1 ? 'query' : 'queries'}
            </Button>
          ) : null}
          <Text fontFamily="mono" fontSize="xs" color="muted">
            dash platform · sdk-only
          </Text>
        </HStack>
      </HStack>
    </Box>
  );
}
