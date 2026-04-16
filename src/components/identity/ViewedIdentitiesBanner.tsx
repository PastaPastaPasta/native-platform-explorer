'use client';

import { useEffect, useState } from 'react';
import { Button, HStack, Text } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useViewedIdentities } from '@hooks/useViewedIdentities';

const DISMISSED_KEY = 'npe:viewedIdentitiesBannerDismissed';

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
    <InfoBlock>
      <HStack justify="space-between" flexWrap="wrap" spacing={3}>
        <Text fontSize="sm" color="gray.250">
          Remember identities you&apos;ve viewed? It lets the token-holders seed list auto-fill.
          Stored only in your browser; cleared on request.
        </Text>
        <HStack spacing={2}>
          <Button
            size="sm"
            colorScheme="blue"
            onClick={() => {
              setConsent(true);
              record(identityId);
            }}
          >
            Remember
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            No thanks
          </Button>
        </HStack>
      </HStack>
    </InfoBlock>
  );
}
