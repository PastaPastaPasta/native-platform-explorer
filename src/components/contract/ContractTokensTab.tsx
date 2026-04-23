'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import {
  Button,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { LoadingCard } from '@ui/LoadingCard';
import { useSdk } from '@sdk/hooks';
import type { ContractShape } from '@util/contract';
import { tokenConfigAt, tokenPositions } from '@util/contract';

interface DerivedToken {
  position: number;
  tokenId: string | null;
  name?: string;
  decimals?: number;
}

/**
 * Lists every token position declared by the contract, derives the token ID
 * for each via `sdk.tokens.calculateId(contractId, position)`, and links
 * through to the standalone token page. The derivation is deterministic
 * (`hash(contractId ‖ position)` — see `Token::calculate_token_id` in
 * `rs-drive`), so we can do it client-side without a network round-trip.
 */
export function ContractTokensTab({
  contractId,
  contract,
}: {
  contractId: string;
  contract: ContractShape | null;
}) {
  const { sdk, status } = useSdk();
  const [rows, setRows] = useState<DerivedToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contract || !sdk || status !== 'ready') return;
    const positions = tokenPositions(contract);
    if (positions.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const out: DerivedToken[] = [];
        for (const posStr of positions) {
          const pos = Number(posStr);
          if (!Number.isFinite(pos)) continue;
          const config = tokenConfigAt(contract, pos);
          let tokenId: string | null = null;
          try {
            tokenId = String(await sdk.tokens.calculateId(contractId, pos));
          } catch {
            tokenId = null;
          }
          out.push({
            position: pos,
            tokenId,
            name: config?.primaryName,
            decimals: config?.decimals,
          });
        }
        if (!cancelled) setRows(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract, contractId, sdk, status]);

  if (!contract) return null;
  if (error) {
    return <Text color="red.300" fontSize="sm">Failed to derive token IDs: {error}</Text>;
  }
  if (rows === null) return <LoadingCard lines={2} />;
  if (rows.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        This contract does not define any tokens.
      </Text>
    );
  }

  return (
    <VStack align="stretch" spacing={3}>
      <Table size="sm">
        <Thead>
          <Tr>
            <Th color="gray.400" borderColor="gray.750">#</Th>
            <Th color="gray.400" borderColor="gray.750">Name</Th>
            <Th color="gray.400" borderColor="gray.750" isNumeric>Decimals</Th>
            <Th color="gray.400" borderColor="gray.750">Token ID</Th>
            <Th color="gray.400" borderColor="gray.750"></Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.position} _hover={{ bg: 'gray.800' }}>
              <Td borderColor="gray.750">
                <Text fontFamily="mono" color="gray.100">#{r.position}</Text>
              </Td>
              <Td borderColor="gray.750">
                <Text color="gray.100">{r.name ?? '—'}</Text>
              </Td>
              <Td borderColor="gray.750" isNumeric>
                <Text color="gray.250">{r.decimals ?? '—'}</Text>
              </Td>
              <Td borderColor="gray.750">
                {r.tokenId ? <Identifier value={r.tokenId} dense /> : <Text color="gray.500">unknown</Text>}
              </Td>
              <Td borderColor="gray.750">
                <HStack spacing={2}>
                  {r.tokenId ? (
                    <Button
                      as={NextLink}
                      href={`/token/?id=${encodeURIComponent(r.tokenId)}`}
                      size="xs"
                      variant="outline"
                      colorScheme="orange"
                    >
                      Open
                    </Button>
                  ) : null}
                  <Button
                    as={NextLink}
                    href={`/contract/token/?id=${encodeURIComponent(contractId)}&position=${r.position}`}
                    size="xs"
                    variant="ghost"
                  >
                    by position
                  </Button>
                </HStack>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Text fontSize="xs" color="gray.500">
        Token IDs are derived deterministically from <code>(contractId, position)</code> —
        no network call is made per row beyond loading the contract.
      </Text>
    </VStack>
  );
}
