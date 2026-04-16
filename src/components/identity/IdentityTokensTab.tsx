'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { useTokenIdentityBalances } from '@sdk/queries';
import { WELL_KNOWN } from '@constants/well-known';
import { isBase58Identifier } from '@util/identifier';

export function IdentityTokensTab({ identityId }: { identityId: string }) {
  const wellKnownTokenIds = useMemo(
    () => WELL_KNOWN.filter((w) => w.kind === 'token').map((w) => w.id),
    [],
  );
  const [adhoc, setAdhoc] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const all = useMemo(
    () => Array.from(new Set([...wellKnownTokenIds, ...adhoc])),
    [wellKnownTokenIds, adhoc],
  );

  const q = useTokenIdentityBalances(identityId, all.length > 0 ? all : undefined);
  const rows = useMemo(() => {
    if (!q.data || !(q.data instanceof Map)) return [];
    const out: Array<{ tokenId: string; balance: bigint }> = [];
    for (const [id, val] of q.data) {
      out.push({
        tokenId: typeof id === 'string' ? id : String(id),
        balance: typeof val === 'bigint' ? val : BigInt(String(val ?? 0)),
      });
    }
    return out;
  }, [q.data]);

  const addToken = () => {
    const v = input.trim();
    if (isBase58Identifier(v) && !adhoc.includes(v)) {
      setAdhoc((a) => [...a, v]);
    }
    setInput('');
  };

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock>
        <VStack align="stretch" spacing={3}>
          <HStack spacing={2}>
            <Input
              size="sm"
              placeholder="Add token ID (base58 Identifier)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              fontFamily="mono"
              bg="gray.800"
              borderColor="gray.700"
            />
            <Button
              size="sm"
              colorScheme="blue"
              onClick={addToken}
              isDisabled={!isBase58Identifier(input.trim())}
            >
              Add
            </Button>
          </HStack>
          <Text fontSize="xs" color="gray.400">
            {all.length === 0
              ? 'No token IDs in scope yet. Add one above, or seed the well-known registry.'
              : `Querying ${all.length} token${all.length === 1 ? '' : 's'}.`}
          </Text>
        </VStack>
      </InfoBlock>

      {q.isLoading ? (
        <LoadingCard lines={3} />
      ) : q.isError ? (
        <ErrorCard error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <InfoBlock>
          <Text color="gray.400" fontSize="sm">
            No balances returned for the queried tokens.
          </Text>
        </InfoBlock>
      ) : (
        <InfoBlock>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Token</Th>
                  <Th color="gray.400" borderColor="gray.750" isNumeric>Balance</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.tokenId} _hover={{ bg: 'gray.800' }}>
                    <Td borderColor="gray.750">
                      <Identifier
                        value={r.tokenId}
                        href={`/token/?id=${encodeURIComponent(r.tokenId)}`}
                        dense
                      />
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
      )}
    </VStack>
  );
}
