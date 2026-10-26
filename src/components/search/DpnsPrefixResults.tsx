'use client';

import { useMemo } from 'react';
import NextLink from 'next/link';
import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Alias } from '@components/data/Alias';
import { IdentityLink } from '@components/data/IdentityLink';
import { usePrefetchProps } from '@hooks/usePrefetch';
import { useSdk } from '@sdk/hooks';
import { useDpnsPrefixSearch } from '@sdk/queries';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { convertToHomographSafeChars, dpnsDomainRows, type DpnsDomainRow } from '@util/dpns';
import { withNetwork } from '@util/exploration';

export const INLINE_PREFIX_LIMIT = 10;

function NameRow({ row }: { row: DpnsDomainRow }) {
  const prefetch = usePrefetchProps({ kind: 'dpns', name: row.normalizedFqdn });
  return (
    <HStack spacing={3} flexWrap="wrap" py={1}>
      <span {...prefetch}>
        <Alias name={row.fqdn} href={`/dpns/?name=${encodeURIComponent(row.normalizedFqdn)}`} />
      </span>
      {row.ownerId ? <IdentityLink id={row.ownerId} dense showAlias={false} /> : null}
    </HStack>
  );
}

/** Up to 10 DPNS names starting with `prefix`, shown inline on /search. The
 *  prefix query is a `documents.query` on the DPNS `domain` type (the SDK's
 *  `dpns.usernames` only lists one identity's names). */
export function DpnsPrefixResults({ prefix }: { prefix: string }) {
  const { network } = useSdk();
  const dpns = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'dpns');
  const contractId = (network === 'mainnet' ? dpns?.mainnetId : dpns?.testnetId) ?? undefined;
  const normalized = useMemo(() => convertToHomographSafeChars(prefix), [prefix]);
  const q = useDpnsPrefixSearch(normalized, contractId, INLINE_PREFIX_LIMIT);
  const rows = useMemo(() => dpnsDomainRows(q.data), [q.data]);
  const moreHref = withNetwork(`/dpns/search/?q=${encodeURIComponent(prefix)}`, network);

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between" flexWrap="wrap">
          <Heading size="sm">DPNS names starting with &ldquo;{prefix}&rdquo;</Heading>
          <Button as={NextLink} href={moreHref} size="xs" variant="ghost">
            All results →
          </Button>
        </HStack>
        {q.isLoading ? (
          <LoadingCard lines={3} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => { void q.refetch(); }} />
        ) : rows.length === 0 ? (
          <Text fontSize="sm" color="muted">No DPNS names begin with <code>{prefix}</code>.</Text>
        ) : (
          <VStack align="stretch" spacing={0}>
            {rows.map((row) => <NameRow key={row.docId ?? row.fqdn} row={row} />)}
            {rows.length === INLINE_PREFIX_LIMIT ? (
              <Text fontSize="xs" color="muted" pt={1}>Showing the first {INLINE_PREFIX_LIMIT}.</Text>
            ) : null}
          </VStack>
        )}
      </VStack>
    </InfoBlock>
  );
}
