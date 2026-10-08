'use client';

import { useEffect, useState } from 'react';
import { Box, Button, HStack, Text } from '@chakra-ui/react';
import { useViewedIdentities } from '@hooks/useViewedIdentities';

const DISMISSED_KEY = 'npe:viewedIdentitiesBannerDismissed';

/** Small, low-contrast hint that appears beneath the identity digest. Does
 *  not compete with the hero card for visual weight. */
export function ViewedIdentitiesBanner({ identityId }: { identityId: string }) {
  const { consent, setConsent, record, error } = useViewedIdentities();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (consent && identityId) record(identityId);
  }, [consent, identityId, record]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Dismissal still applies for this page when browser storage is blocked.
    }
    setDismissed(true);
  };

  if (consent || dismissed) return null;

  return (
    <Box
      px={3}
      py={1.5}
      borderRadius="md"
      bg="raised"
      border="1px dashed"
      borderColor="hairlineStrong"
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
            }}
          >
            Remember
          </Button>
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </HStack>
      </HStack>
      {error ? <Text role="alert" fontSize="xs" color="failed">{error.message}</Text> : null}
    </Box>
  );
}
