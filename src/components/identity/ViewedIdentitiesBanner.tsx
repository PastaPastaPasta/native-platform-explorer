'use client';

import { useEffect, useState } from 'react';
import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { useViewedIdentities } from '@hooks/useViewedIdentities';

const DISMISSED_KEY = 'npe:viewedIdentitiesBannerDismissed';

/** Small, low-contrast hint that appears beneath the identity digest. Does
 *  not compete with the hero card for visual weight. */
export function ViewedIdentitiesBanner({ identityId }: { identityId: string }) {
  const { consent, setConsent, record } = useViewedIdentities();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(typeof window !== 'undefined' && window.localStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  useEffect(() => {
    if (consent && identityId) record(identityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent, identityId]);

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    }
    setDismissed(true);
  };

  if (consent || dismissed) return null;

  return (
    <Box
      px={3}
      py={1.5}
      borderRadius="md"
      bg="rgba(35,44,48,0.4)"
      border="1px dashed"
      borderColor="whiteAlpha.100"
    >
      <HStack justify="space-between" flexWrap="wrap" spacing={3}>
        <Text fontSize="xs" color="gray.400">
          Remember identities you view? Seeds the token-holders form.
        </Text>
        <HStack spacing={1}>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="blue"
            onClick={() => {
              setConsent(true);
              record(identityId);
            }}
          >
            Remember
          </Button>
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
