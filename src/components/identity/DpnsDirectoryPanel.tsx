'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  HStack,
  Heading,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Alias } from '@components/data/Alias';
import { IdentityLink } from '@components/data/IdentityLink';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { useDocumentsQuery } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { idToString, readProp } from '@util/sdk-shape';

function extractRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (data instanceof Map) {
    const out: Array<Record<string, unknown>> = [];
    for (const [, doc] of data) {
      if (doc && typeof doc === 'object') out.push(doc as Record<string, unknown>);
    }
    return out;
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }
  return [];
}

function docIdOf(row: Record<string, unknown>): string | undefined {
  return (
    idToString(readProp(row, '$id')) ??
    idToString(readProp(row, 'id'))
  );
}

/**
 * Paginated browser over every registered `.dash` DPNS name via the SDK's
 * documents.query primitive against the DPNS contract's `domain` type.
 *
 * DPNS's `parentNameAndLabel` index (normalizedParentDomainName, normalizedLabel)
 * is the only path to a consistent ordering — there's no index on $createdAt,
 * so this is alphabetical, not "most recent". Labelled honestly.
 */
export function DpnsDirectoryPanel() {
  const { network } = useSdk();
  const dpns = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'dpns');
  const contractId = network === 'mainnet' ? dpns?.mainnetId : dpns?.testnetId;

  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];
  const LIMIT = 25;

  const queryParams = contractId
    ? {
        dataContractId: contractId,
        documentTypeName: 'domain',
        where: [['normalizedParentDomainName', '==', 'dash']] as unknown[],
        orderBy: [['normalizedLabel', 'asc'] as [string, 'asc' | 'desc']],
        limit: LIMIT,
        startAfter,
      }
    : undefined;

  const q = useDocumentsQuery(queryParams);
  const rows = useMemo(() => extractRows(q.data), [q.data]);

  if (!contractId) {
    return (
      <InfoBlock>
        <VStack align="flex-start" spacing={1}>
          <Heading size="sm" color="gray.100">
            DPNS directory
          </Heading>
          <Text fontSize="sm" color="gray.400">
            No DPNS contract ID registered for {network}. Add one to the
            well-known registry to enable this view.
          </Text>
        </VStack>
      </InfoBlock>
    );
  }

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" flexWrap="wrap" spacing={3}>
          <Heading size="sm" color="gray.100">
            DPNS directory
          </Heading>
          <Badge
            variant="subtle"
            colorScheme="gray"
            fontSize="2xs"
            textTransform="none"
          >
            alphabetical · {LIMIT} per page
          </Badge>
        </HStack>
        <Text fontSize="xs" color="gray.400">
          Every registered <code>.dash</code> name, read live from DPNS via{' '}
          <code>documents.query</code>. Each row links to the name and its owner
          identity. DPNS has no <code>$createdAt</code> index so this is sorted
          alphabetically, not by recency.
        </Text>

        {q.isLoading ? (
          <LoadingCard lines={6} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Text color="gray.400" fontSize="sm">
            No names found. If this persists, DPNS may not be deployed on this
            network yet.
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">
                    Name
                  </Th>
                  <Th color="gray.400" borderColor="gray.750">
                    Owner
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row, i) => {
                  const label =
                    (readProp<string>(row, 'label') as string | undefined) ??
                    (readProp<string>(row, 'normalizedLabel') as string | undefined) ??
                    '';
                  const ownerId = idToString(
                    readProp(row, '$ownerId') ?? readProp(row, 'ownerId'),
                  );
                  const key = docIdOf(row) ?? `${label}-${i}`;
                  if (!label) return null;
                  const fqdn = `${label.toLowerCase()}.dash`;
                  return (
                    <Tr key={key} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750">
                        <Alias
                          name={fqdn}
                          href={`/dpns/?name=${encodeURIComponent(fqdn)}`}
                        />
                      </Td>
                      <Td borderColor="gray.750">
                        {ownerId ? <IdentityLink id={ownerId} dense /> : '—'}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        )}

        <HStack justify="space-between">
          <Text fontSize="xs" color="gray.400">
            {rows.length} name{rows.length === 1 ? '' : 's'} on this page ·{' '}
            <NextLink
              href="/dpns/search/"
              style={{ color: 'var(--chakra-colors-brand-light)' }}
            >
              prefix search →
            </NextLink>
          </Text>
          <CursorPagination
            pageIndex={cursorStack.length - 1}
            hasPrev={cursorStack.length > 1}
            hasNext={rows.length === LIMIT}
            onPrev={() => setCursorStack((s) => s.slice(0, -1))}
            onNext={() => {
              const last = rows[rows.length - 1];
              const lastId = last ? docIdOf(last) : undefined;
              if (lastId) setCursorStack((s) => [...s, lastId]);
            }}
          />
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
