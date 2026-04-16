'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Heading,
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
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { DateBlock } from '@components/data/DateBlock';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { useTokenHistoryDirectPurchases } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { idToString, readProp } from '@util/sdk-shape';

const LIMIT = 25;

function extractRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (data instanceof Map) {
    const out: Array<Record<string, unknown>> = [];
    for (const [, doc] of data) if (doc && typeof doc === 'object') out.push(doc as Record<string, unknown>);
    return out;
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }
  return [];
}

function docIdOf(row: Record<string, unknown>): string | undefined {
  return idToString(readProp(row, 'id')) ?? idToString(readProp(row, '$id'));
}

interface PurchaseRow {
  tokenId: string;
  buyerId: string | null;
  tokenAmount: string;
  purchaseCostCredits: bigint | null;
  createdAtMs: number | null;
  docId: string | null;
}

function normalisePurchase(row: Record<string, unknown>): PurchaseRow | null {
  const props =
    (readProp<Record<string, unknown>>(row, 'properties') as Record<string, unknown> | undefined) ??
    {};
  const tokenId = idToString(props.tokenId);
  if (!tokenId) return null;
  const buyerId = idToString(readProp(row, 'ownerId') ?? readProp(row, '$ownerId'));
  const tokenAmountRaw = props.tokenAmount;
  const purchaseCostRaw = props.purchaseCost;
  const createdAt =
    readProp<bigint | number>(row, 'createdAt') ?? (props.$createdAt as bigint | number | undefined);
  const createdAtMs =
    createdAt !== undefined && createdAt !== null
      ? typeof createdAt === 'bigint'
        ? Number(createdAt)
        : Number(createdAt)
      : null;
  return {
    tokenId,
    buyerId: buyerId ?? null,
    tokenAmount: String(tokenAmountRaw ?? ''),
    purchaseCostCredits:
      purchaseCostRaw === undefined || purchaseCostRaw === null
        ? null
        : typeof purchaseCostRaw === 'bigint'
          ? purchaseCostRaw
          : BigInt(String(purchaseCostRaw)),
    createdAtMs,
    docId: docIdOf(row) ?? null,
  };
}

export function TokenDiscoveryPanel() {
  const { network } = useSdk();
  const entry = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'token-history');
  const contractId = network === 'mainnet' ? entry?.mainnetId : entry?.testnetId;

  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];

  const q = useTokenHistoryDirectPurchases(contractId ?? undefined, LIMIT, startAfter);
  const rawRows = useMemo(() => extractRows(q.data), [q.data]);
  const rows = useMemo(
    () => rawRows.map(normalisePurchase).filter((r): r is PurchaseRow => r !== null),
    [rawRows],
  );

  // Count unique tokenIds on the current page (discovery signal).
  const uniqueTokensThisPage = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.tokenId);
    return s.size;
  }, [rows]);

  if (!contractId) {
    return (
      <InfoBlock>
        <Heading size="sm" color="gray.100" mb={2}>
          Token discovery
        </Heading>
        <Text color="gray.400" fontSize="sm">
          No token-history contract ID registered for {network}.
        </Text>
      </InfoBlock>
    );
  }

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" flexWrap="wrap" spacing={3}>
          <Heading size="sm" color="gray.100">
            Token discovery (via direct-purchase history)
          </Heading>
          <Badge variant="subtle" colorScheme="gray" fontSize="2xs" textTransform="none">
            {rows.length} event{rows.length === 1 ? '' : 's'} · {uniqueTokensThisPage} unique token
            {uniqueTokensThisPage === 1 ? '' : 's'}
          </Badge>
        </HStack>
        <Text fontSize="xs" color="gray.400">
          The <code>token-history</code> contract keys every other index by{' '}
          <code>tokenId</code>, so we can&apos;t enumerate tokens we don&apos;t
          already know about. The one exception is the <code>directPurchase</code>{' '}
          type&apos;s <code>byPurchaseCost</code> index, which paginates globally
          across all tokens. This panel surfaces every direct-purchase event and
          extracts the token IDs — a partial but honest discovery path.
        </Text>

        {q.isLoading ? (
          <LoadingCard lines={6} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Text color="gray.400" fontSize="sm">
            No direct-purchase events recorded on this network yet.
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Token</Th>
                  <Th color="gray.400" borderColor="gray.750">Buyer</Th>
                  <Th color="gray.400" borderColor="gray.750" isNumeric>Amount</Th>
                  <Th color="gray.400" borderColor="gray.750" isNumeric>Cost</Th>
                  <Th color="gray.400" borderColor="gray.750">When</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.docId ?? `${r.tokenId}-${r.createdAtMs}`} _hover={{ bg: 'gray.800' }}>
                    <Td borderColor="gray.750">
                      <Identifier
                        value={r.tokenId}
                        href={`/token/?id=${encodeURIComponent(r.tokenId)}`}
                        dense
                      />
                    </Td>
                    <Td borderColor="gray.750">
                      {r.buyerId ? <IdentityLink id={r.buyerId} dense /> : '—'}
                    </Td>
                    <Td borderColor="gray.750" isNumeric>
                      <BigNumberDisplay value={r.tokenAmount} />
                    </Td>
                    <Td borderColor="gray.750" isNumeric>
                      <CreditsBlock credits={r.purchaseCostCredits} layout="compact" showUsd={false} />
                    </Td>
                    <Td borderColor="gray.750">
                      <DateBlock value={r.createdAtMs} relative />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        <HStack justify="space-between">
          <Text fontSize="xs" color="gray.500">
            sorted by purchase cost ascending · 25 per page
          </Text>
          <CursorPagination
            pageIndex={cursorStack.length - 1}
            hasPrev={cursorStack.length > 1}
            hasNext={rows.length === LIMIT}
            onPrev={() => setCursorStack((s) => s.slice(0, -1))}
            onNext={() => {
              const last = rawRows[rawRows.length - 1];
              const lastId = last ? docIdOf(last) : undefined;
              if (lastId) setCursorStack((s) => [...s, lastId]);
            }}
          />
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
