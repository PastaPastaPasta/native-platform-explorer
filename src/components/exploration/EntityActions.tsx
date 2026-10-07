'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';
import { useSavedEntities } from '@hooks/useSavedEntities';
import { sameEntity, shareUrl, type SavedEntityKind } from '@util/exploration';
import { isBuiltInNetwork } from '@sdk/networks';

export function ShareLinkButton() {
  const { network } = useSdk();
  const [message, setMessage] = useState('');

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareUrl(window.location.href, network));
      setMessage(isBuiltInNetwork(network)
        ? `Link copied for ${network}.`
        : `Link copied for ${network}. Recipients must configure this custom devnet first.`);
    } catch {
      setMessage('Could not copy the link. Check clipboard permission and try again.');
    }
  };

  return (
    <VStack align="start" spacing={1}>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        Copy share link
      </Button>
      <Text role="status" fontSize="xs" color="muted">{message}</Text>
    </VStack>
  );
}

export function EntityActions({ kind, id }: { kind: SavedEntityKind; id: string }) {
  const { network } = useSdk();
  const saved = useSavedEntities();
  const entity = { kind, id, network };
  const existing = saved.items.find((item) => sameEntity(item, entity));

  return (
    <VStack align="start" spacing={2}>
      <HStack spacing={3} align="start" flexWrap="wrap">
        <Button
          size="sm"
          variant="outline"
          aria-pressed={!!existing}
          isDisabled={!saved.ready}
          onClick={() => existing ? saved.remove(existing) : saved.save(entity)}
        >
          {existing ? `Remove saved ${kind}` : `Save ${kind}`}
        </Button>
        <ShareLinkButton />
        <Button as={NextLink} href="/saved/" size="sm" variant="ghost">Saved items</Button>
      </HStack>
      {saved.error ? <Text role="alert" fontSize="sm" color="failed">Could not save changes: {saved.error.message}</Text> : null}
    </VStack>
  );
}
