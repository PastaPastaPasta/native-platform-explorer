'use client';

import { useState } from 'react';
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
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { LoadingCard } from '@ui/LoadingCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { parseSeededInput, type SeededEntry } from '@util/seededInput';
import { useSdk } from '@sdk/hooks';
import { useViewedIdentities } from '@hooks/useViewedIdentities';
import { WELL_KNOWN } from '@constants/well-known';

export interface SeededHoldersFormProps {
  tokenId: string;
}

export function SeededHoldersForm({ tokenId }: SeededHoldersFormProps) {
  const { sdk, status } = useSdk();
  const { ids: viewedIds } = useViewedIdentities();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rows, setRows] = useState<
    Array<{ id: string; balance: bigint; label: string }>
  >([]);

  const addList = (ids: string[]) => {
    if (ids.length === 0) return;
    setText((t) => (t ? `${t}\n${ids.join('\n')}` : ids.join('\n')));
  };

  const run = async () => {
    if (!sdk || status !== 'ready') return;
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const entries = parseSeededInput(text);
      const resolved: Array<{ id: string; label: string }> = [];
      for (const e of entries) {
        if (e.kind === 'identifier') {
          resolved.push({ id: e.value, label: e.value });
        } else if (e.kind === 'dpns') {
          const id = await sdk.dpns.resolveName(e.value);
          if (typeof id === 'string') resolved.push({ id, label: e.value });
        }
      }
      if (resolved.length === 0) {
        setLoading(false);
        return;
      }
      const ids = resolved.map((r) => r.id);
      const result = (await sdk.tokens.balances(ids, tokenId)) as Map<unknown, bigint>;
      const out: typeof rows = [];
      for (const [key, val] of result) {
        const idStr = typeof key === 'string' ? key : String(key);
        const match = resolved.find((r) => r.id === idStr);
        out.push({ id: idStr, balance: typeof val === 'bigint' ? val : BigInt(String(val ?? 0)), label: match?.label ?? idStr });
      }
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };

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
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                addList(WELL_KNOWN.filter((w) => w.kind === 'identity').map((w) => w.id))
              }
            >
              Add well-known
            </Button>
            <Box flex="1" />
            <Button
              size="sm"
              colorScheme="blue"
              onClick={() => void run()}
              isDisabled={entries.filter((e) => e.kind !== 'invalid').length === 0 || loading}
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

      {error ? <ErrorCard error={error} onRetry={() => void run()} /> : null}
      {loading ? <LoadingCard lines={3} /> : null}
      {rows.length > 0 ? (
        <InfoBlock>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Identity</Th>
                  <Th color="gray.400" borderColor="gray.750" isNumeric>Balance</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
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
