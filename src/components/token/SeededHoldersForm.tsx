'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { LoadingCard } from '@ui/LoadingCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { ProofChip } from '@components/data/ProofChip';
import { SortableTh, useSortState, useSortedRows } from '@components/data/SortableTh';
import { parseSeededInput, type SeededEntry } from '@util/seededInput';
import { useSdk } from '@sdk/hooks';
import { useTokenBalances } from '@sdk/queries';
import { useViewedIdentities } from '@hooks/useViewedIdentities';
import { useWellKnownEntries } from '@hooks/useWellKnownRegistry';

export interface SeededHoldersFormProps {
  tokenId: string;
}

export function SeededHoldersForm({ tokenId }: SeededHoldersFormProps) {
  const { sdk, status } = useSdk();
  const { ids: viewedIds } = useViewedIdentities();
  const wellKnownIdentities = useWellKnownEntries('identity');
  const [text, setText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<Error | null>(null);
  // The identities to query, with the name each was entered as. Balances go
  // through the proof-aware query layer (proof chip, Query Inspector).
  const [resolved, setResolved] = useState<Array<{ id: string; label: string }>>([]);
  const balancesQ = useTokenBalances(resolved.map((r) => r.id), tokenId);
  const rows = useMemo(() => {
    if (!(balancesQ.data instanceof Map)) return [];
    return [...(balancesQ.data as Map<unknown, unknown>)].map(([key, val]) => {
      const id = String(key);
      return {
        id,
        balance: typeof val === 'bigint' ? val : BigInt(String(val ?? 0)),
        label: resolved.find((r) => r.id === id)?.label ?? id,
      };
    });
  }, [balancesQ.data, resolved]);

  const addList = (ids: string[]) => {
    if (ids.length === 0) return;
    setText((t) => (t ? `${t}\n${ids.join('\n')}` : ids.join('\n')));
  };

  const ready = !!sdk && status === 'ready';
  const run = async () => {
    if (!sdk || !ready) return;
    setResolving(true);
    setResolveError(null);
    setResolved([]);
    try {
      const next: Array<{ id: string; label: string }> = [];
      for (const e of parseSeededInput(text)) {
        if (e.kind === 'identifier') {
          next.push({ id: e.value, label: e.value });
        } else if (e.kind === 'dpns') {
          // DPNS name resolution has no proof variant in the SDK.
          const id = await sdk.dpns.resolveName(e.value);
          if (typeof id === 'string') next.push({ id, label: e.value });
        }
      }
      setResolved(next);
    } catch (e) {
      setResolveError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setResolving(false);
    }
  };
  const loading = resolving || balancesQ.isLoading;
  const error = resolveError ?? (balancesQ.isError ? balancesQ.error : null);
  const retry = () => (resolveError ? void run() : void balancesQ.refetch());

  const { sort, toggle } = useSortState<'identity' | 'balance'>({ key: 'balance', direction: 'desc' });
  const sortedRows = useSortedRows(rows, sort, {
    identity: (r) => r.label,
    balance: (r) => r.balance,
  });

  const entries: SeededEntry[] = parseSeededInput(text);
  const invalid = entries.filter((e) => e.kind === 'invalid');

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock>
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" color="gray.250">
            Dash Platform does not publish a holder index. Paste identity IDs (or DPNS names)
            below to look up their balances for this token.
          </Text>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="alice.dash&#10;GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec&#10;bob.dash"
            fontFamily="mono"
            fontSize="xs"
            minH="120px"
            bg="gray.800"
            borderColor="gray.700"
          />
          <HStack spacing={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => addList(viewedIds)}
              isDisabled={viewedIds.length === 0}
            >
              Add viewed identities ({viewedIds.length})
            </Button>
            {wellKnownIdentities.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => addList(wellKnownIdentities.map((w) => w.id))}
              >
                Add well-known ({wellKnownIdentities.length})
              </Button>
            ) : null}
            <Box flex="1" />
            <Button
              size="sm"
              colorScheme="blue"
              onClick={() => void run()}
              isDisabled={entries.filter((e) => e.kind !== 'invalid').length === 0 || loading || !ready}
            >
              Resolve &amp; query
            </Button>
          </HStack>
          {invalid.length > 0 ? (
            <HStack spacing={2} flexWrap="wrap">
              <Text fontSize="xs" color="warning">
                Ignored:
              </Text>
              {invalid.map((e) => (
                <Badge key={e.raw} colorScheme="yellow" variant="subtle">
                  {e.raw}
                </Badge>
              ))}
            </HStack>
          ) : null}
        </VStack>
      </InfoBlock>

      {error ? <ErrorCard error={error} onRetry={retry} /> : null}
      {loading ? <LoadingCard lines={3} /> : null}
      {rows.length > 0 ? (
        <InfoBlock>
          <HStack justify="flex-end" mb={2}>
            <ProofChip proofState={balancesQ.proofState} size="xs" />
          </HStack>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <SortableTh column="identity" sort={sort} onSort={toggle} color="gray.400" borderColor="gray.750">Identity</SortableTh>
                  <SortableTh column="balance" sort={sort} onSort={toggle} firstDirection="desc" color="gray.400" borderColor="gray.750" isNumeric>Balance</SortableTh>
                </Tr>
              </Thead>
              <Tbody>
                {sortedRows.map((r) => (
                  <Tr key={r.id} _hover={{ bg: 'gray.800' }}>
                    <Td borderColor="gray.750">
                      <IdentityLink id={r.id} dense />
                    </Td>
                    <Td borderColor="gray.750" isNumeric>
                      <BigNumberDisplay value={r.balance} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </InfoBlock>
      ) : null}
    </VStack>
  );
}
