'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { Button, HStack, IconButton, Text, Tooltip, useToast, VisuallyHidden, VStack } from '@chakra-ui/react';
import { LinkIcon } from '@chakra-ui/icons';
import { useSdk } from '@sdk/hooks';
import { useSavedEntities } from '@hooks/useSavedEntities';
import { sameEntity, shareUrl, type SavedEntityKind } from '@util/exploration';
import { hasNetwork, isBuiltInNetwork } from '@sdk/networks';

export function ShareLinkButton({ compact = false }: { compact?: boolean }) {
  const { network } = useSdk();
  const [message, setMessage] = useState('');
  const toast = useToast();

  const report = (text: string, status: 'success' | 'error') => {
    setMessage(text);
    if (compact) toast({ title: text, status, duration: status === 'error' ? 6000 : 4000, isClosable: true });
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      const requested = new URL(window.location.href).searchParams.get('network');
      // Unknown network links block the provider, which retains its last valid
      // selection. Preserve the requested context when sharing that error page.
      const shareNetwork = requested && !hasNetwork(requested) ? requested : network;
      await navigator.clipboard.writeText(shareUrl(window.location.href, shareNetwork));
      report(isBuiltInNetwork(shareNetwork)
        ? `Link copied for ${shareNetwork}.`
        : `Link copied for ${shareNetwork}. Recipients must configure this custom devnet first.`, 'success');
    } catch {
      report('Could not copy the link. Check clipboard permission and try again.', 'error');
    }
  };

  return (
    <VStack align="start" spacing={1}>
      {compact ? (
        <Tooltip label="Copy page link" hasArrow>
          <IconButton aria-label="Copy page link" icon={<LinkIcon />} size="sm" variant="ghost" onClick={() => void copy()} />
        </Tooltip>
      ) : <Button size="sm" variant="outline" onClick={() => void copy()}>Copy share link</Button>}
      {compact ? <VisuallyHidden role="status">{message}</VisuallyHidden> : <Text role="status" fontSize="xs" color="muted">{message}</Text>}
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
