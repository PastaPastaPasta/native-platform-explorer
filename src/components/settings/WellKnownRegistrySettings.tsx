'use client';

import { useState, type FormEvent } from 'react';
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { useWellKnownRegistry } from '@hooks/useWellKnownRegistry';
import type { WellKnownKind } from '@constants/well-known';
import type { WellKnownSource } from '@util/well-known-registry';

const SOURCE_SCHEME: Record<WellKnownSource, string> = {
  bundled: 'gray',
  remote: 'purple',
  local: 'blue',
};

function RemoteStatus() {
  const { remote } = useWellKnownRegistry();
  if (remote.status === 'disabled') {
    return (
      <Text fontSize="xs" color="muted">
        No remote registry is configured for this build (<code>NEXT_PUBLIC_WELL_KNOWN_URL</code>).
      </Text>
    );
  }
  if (remote.status === 'loading') {
    return <Text fontSize="xs" color="muted">Loading the remote registry from {remote.url}…</Text>;
  }
  if (remote.status === 'ready') {
    return (
      <Text fontSize="xs" color="muted">
        Remote registry: {remote.count} entr{remote.count === 1 ? 'y' : 'ies'} from {remote.url}.
      </Text>
    );
  }
  return (
    <Text role="alert" fontSize="xs" color="warning">
      The remote registry at {remote.url} was not loaded, so only bundled and local entries are
      shown: {remote.message}
    </Text>
  );
}

export function WellKnownRegistrySettings() {
  const registry = useWellKnownRegistry();
  const [id, setId] = useState('');
  const [kind, setKind] = useState<WellKnownKind>('identity');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [error, setError] = useState<string | null>(null);
  // Local entries are listed from storage, not from the merged list, so one
  // that a bundled or remote entry now shadows can still be seen and removed.
  const shared = registry.allEntries.filter((entry) => entry.source !== 'local');
  const shadowedBy = (entry: { id: string; network?: string }) => shared.find((other) => other.id === entry.id
    && (!other.network || !entry.network || other.network === entry.network));
  const rows = [
    ...shared.map((entry) => ({ entry, shadow: undefined })),
    ...registry.local.map((entry) => ({ entry: { ...entry, source: 'local' as const }, shadow: shadowedBy(entry) })),
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      registry.addLocal({
        id: id.trim(),
        kind,
        name,
        ...(tags.trim() ? { tags: tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean) } : {}),
        ...(scope === 'current' ? { network: registry.network } : {}),
      });
      setId('');
      setName('');
      setTags('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <RemoteStatus />
      <Box as="form" onSubmit={submit} aria-label="Add a local well-known entry">
        <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3} alignItems="end">
          <FormControl>
            <FormLabel fontSize="xs">Identifier</FormLabel>
            <Input size="sm" fontFamily="mono" value={id} onChange={(e) => setId(e.target.value)} placeholder="base58 ID" />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="xs">Kind</FormLabel>
            <Select size="sm" value={kind} onChange={(e) => setKind(e.target.value as WellKnownKind)}>
              <option value="identity">Identity</option>
              <option value="contract">Contract</option>
              <option value="token">Token</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel fontSize="xs">Name</FormLabel>
            <Input size="sm" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="xs">Tags</FormLabel>
            <Input size="sm" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. groups" />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="xs">Network</FormLabel>
            <Select size="sm" value={scope} onChange={(e) => setScope(e.target.value as 'current' | 'all')}>
              <option value="current">{registry.network} only</option>
              <option value="all">Every network</option>
            </Select>
          </FormControl>
        </SimpleGrid>
        {error ? (
          <Text role="alert" mt={2} fontSize="xs" color="failed">{error}</Text>
        ) : null}
        <HStack mt={3}>
          <Button size="sm" variant="outline" type="submit" isDisabled={!id.trim() || !name.trim()}>
            Add local entry
          </Button>
          <Text fontSize="xs" color="muted">Stored in this browser only.</Text>
        </HStack>
      </Box>

      <VStack align="stretch" spacing={0} divider={<Box h="1px" bg="hairline" />}>
        {rows.map(({ entry, shadow }) => (
          <HStack key={`${entry.source}:${entry.network ?? '*'}:${entry.id}`} py={2} spacing={3} flexWrap="wrap" justify="space-between">
            <VStack align="start" spacing={1} minW={0}>
              <HStack spacing={2} flexWrap="wrap">
                <Text fontSize="sm" color="ink">{entry.name}</Text>
                <Badge variant="subtle">{entry.kind}</Badge>
                <Badge variant="subtle" colorScheme={SOURCE_SCHEME[entry.source]}>{entry.source}</Badge>
                <Text fontSize="xs" color="muted">{entry.network ?? 'every network'}</Text>
                {entry.tags?.length ? <Text fontSize="xs" color="muted">#{entry.tags.join(' #')}</Text> : null}
                {shadow ? (
                  <Text fontSize="xs" color="warning">not used: the {shadow.source} entry &ldquo;{shadow.name}&rdquo; names this ID</Text>
                ) : null}
              </HStack>
              <Identifier value={entry.id} dense copy={false} />
            </VStack>
            {entry.source === 'local' ? (
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Remove local entry ${entry.name}`}
                onClick={() => registry.removeLocal(entry)}
              >
                Remove
              </Button>
            ) : null}
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}
