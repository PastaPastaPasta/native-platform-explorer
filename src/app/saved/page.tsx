'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { Badge, Button, FormControl, FormLabel, Heading, HStack, Select, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { Identifier } from '@components/data/Identifier';
import { useSavedEntities } from '@hooks/useSavedEntities';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useSdk } from '@sdk/hooks';
import { hasNetwork } from '@sdk/networks';
import { savedEntityHref } from '@util/exploration';

export default function SavedPage() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Saved items' }]);
  const { network } = useSdk();
  const saved = useSavedEntities();
  const [scope, setScope] = useState('current');
  const [kind, setKind] = useState('all');
  const items = saved.items.filter((item) => (
    (scope === 'all' || item.network === network) && (kind === 'all' || item.kind === kind)
  ));

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="start" spacing={3}>
            <Heading as="h1" size="md" color="ink">Saved items</Heading>
            <Text fontSize="sm" color="muted">
              Your collection of known identities, contracts, and tokens. Saved only in this browser,
              with the network for each item. Use Save on an entity page to add it.
            </Text>
          </VStack>
        </InfoBlock>
        <InfoBlock>
          <HStack spacing={4} flexWrap="wrap" align="end">
            <FormControl maxW="xs">
              <FormLabel fontSize="sm">Network scope</FormLabel>
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="current">Current network ({network})</option>
                <option value="all">All saved networks</option>
              </Select>
            </FormControl>
            <FormControl maxW="xs">
              <FormLabel fontSize="sm">Entity type</FormLabel>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All types</option>
                <option value="identity">Identities</option>
                <option value="contract">Contracts</option>
                <option value="token">Tokens</option>
              </Select>
            </FormControl>
            <Button variant="outline" isDisabled={saved.items.length === 0} onClick={() => saved.clear()}>
              Clear all saved items
            </Button>
          </HStack>
        </InfoBlock>
        {saved.error ? <Text role="alert" color="failed">Could not update saved items: {saved.error.message}</Text> : null}
        {!saved.ready ? <LoadingCard lines={2} /> : (
          <InfoBlock>
            <VStack align="stretch" spacing={4}>
              <Text role="status" fontSize="sm" color="muted">
                {items.length === 0 ? 'No saved items in this selection.' : `${items.length} saved item${items.length === 1 ? '' : 's'}`}
              </Text>
              {items.map((item) => (
                <HStack key={`${item.network}:${item.kind}:${item.id}`} spacing={4} justify="space-between" flexWrap="wrap">
                  <VStack align="start" spacing={1} minW={0}>
                    <HStack><Badge>{item.kind}</Badge><Text fontSize="xs" color="muted">{item.network}</Text></HStack>
                    <Identifier value={item.id} dense avatar={false} copy={false} />
                    {!hasNetwork(item.network) ? <Text fontSize="xs" color="warning">Configure this custom devnet in Settings before opening.</Text> : null}
                  </VStack>
                  <HStack>
                    {hasNetwork(item.network) ? (
                      <Button as={NextLink} href={savedEntityHref(item)} variant="outline" size="sm" aria-label={`Open ${item.kind} ${item.id} on ${item.network}`}>Open</Button>
                    ) : <Button as={NextLink} href="/settings/" size="sm" variant="outline">Settings</Button>}
                    <Button size="sm" variant="ghost" aria-label={`Remove ${item.kind} ${item.id} on ${item.network}`} onClick={() => saved.remove(item)}>Remove</Button>
                  </HStack>
                </HStack>
              ))}
            </VStack>
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}
