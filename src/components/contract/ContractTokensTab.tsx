'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { BigNumberDisplay } from '@components/data/BigNumber';
import { LoadingCard } from '@ui/LoadingCard';
import { TokenPausedBadge, TokenPrice } from '@components/token/TokenPrice';
import { useSdk } from '@sdk/hooks';
import { useTokenDirectPurchasePrices, useTokenStatuses, useTokenTotalSupply } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';
import { formatTokenAmount } from '@util/token-rules';
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
 * Status and price are fetched for all tokens in one batched call each; total
 * supply has no batch query, so each row asks for its own.
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

  const tokenIds = useMemo(
    () => (rows ?? []).map((r) => r.tokenId).filter((t): t is string => !!t),
    [rows],
  );
  const statusesQ = useTokenStatuses(tokenIds.length ? tokenIds : undefined);
  const pricesQ = useTokenDirectPurchasePrices(tokenIds.length ? tokenIds : undefined);
  const statuses = statusesQ.data instanceof Map ? statusesQ.data : undefined;
  const prices = pricesQ.data instanceof Map ? pricesQ.data : undefined;

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
            <Th color="gray.400" borderColor="gray.750" isNumeric>Total supply</Th>
            <Th color="gray.400" borderColor="gray.750">Status</Th>
            <Th color="gray.400" borderColor="gray.750">Direct-purchase price</Th>
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
              <Td borderColor="gray.750" isNumeric>
                {r.tokenId ? <TokenSupplyCell tokenId={r.tokenId} decimals={r.decimals} /> : '—'}
              </Td>
              <Td borderColor="gray.750">
                {statusesQ.isError ? (
                  <Text as="span" color="red.300" fontSize="xs">failed</Text>
                ) : (
                  <TokenPausedBadge status={r.tokenId ? statuses?.get(r.tokenId) : undefined} loading={statusesQ.isLoading} />
                )}
              </Td>
              <Td borderColor="gray.750">
                {pricesQ.isLoading ? (
                  <Text as="span" color="gray.500" fontSize="xs">…</Text>
                ) : pricesQ.isError ? (
                  <Text as="span" color="red.300" fontSize="xs">failed</Text>
                ) : (
                  <TokenPrice info={r.tokenId ? prices?.get(r.tokenId) : undefined} />
                )}
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
        Token IDs are derived deterministically from <code>(contractId, position)</code>.
        Supply is shown with the token&apos;s decimals. Prices are per smallest unit (10<sup>−decimals</sup>{' '}
        of a token), as Platform charges them.
      </Text>
    </VStack>
  );
}

function TokenSupplyCell({ tokenId, decimals }: { tokenId: string; decimals?: number }) {
  const q = useTokenTotalSupply(tokenId);
  if (q.isLoading) return <Text as="span" color="gray.500" fontSize="xs">…</Text>;
  if (q.isError) return <Text as="span" color="red.300" fontSize="xs">failed</Text>;
  const total = readProp<bigint>(q.data, 'totalSupply');
  if (total === undefined || total === null) return <BigNumberDisplay value={null} />;
  return <Text as="span" fontFamily="mono" fontSize="xs" color="gray.100">{formatTokenAmount(total, decimals)}</Text>;
}
