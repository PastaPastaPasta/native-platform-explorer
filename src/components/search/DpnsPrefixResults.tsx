'use client';

import { useMemo } from 'react';
import NextLink from 'next/link';
import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { DpnsNameLink } from '@components/data/DpnsNameLink';
import { IdentityLink } from '@components/data/IdentityLink';
import { useSdk } from '@sdk/hooks';
import { useDpnsPrefixSearch } from '@sdk/queries';
import { dpnsContractId } from '@constants/system-data-contracts';
import { convertToHomographSafeChars, dpnsDomainRows, dpnsPrefixMatches, type DpnsDomainRow } from '@util/dpns';
import { withNetwork } from '@util/exploration';

export const INLINE_PREFIX_LIMIT = 10;

function NameRow({ row }: { row: DpnsDomainRow }) {
  return (
    <HStack spacing={3} flexWrap="wrap" py={1}>
      <DpnsNameLink fqdn={row.fqdn} normalizedFqdn={row.normalizedFqdn} />
      {row.ownerId ? <IdentityLink id={row.ownerId} dense showAlias={false} /> : null}
    </HStack>
  );
}

/** Up to 10 DPNS names starting with `prefix`, shown inline on /search. The
 *  prefix query is a `documents.query` on the DPNS `domain` type (the SDK's
 *  `dpns.usernames` only lists one identity's names). */
export function DpnsPrefixResults({ prefix }: { prefix: string }) {
  const { network } = useSdk();
  const contractId = dpnsContractId(network);
  const normalized = useMemo(() => convertToHomographSafeChars(prefix.trim()), [prefix]);
  const q = useDpnsPrefixSearch(normalized, contractId, INLINE_PREFIX_LIMIT);
  const docs = useMemo(() => dpnsDomainRows(q.data), [q.data]);
  const { rows, outside } = useMemo(() => dpnsPrefixMatches(docs, normalized), [docs, normalized]);
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
        ) : docs.length === 0 ? (
          <Text fontSize="sm" color="muted">No DPNS names begin with <code>{prefix}</code>.</Text>
        ) : (
          <VStack align="stretch" spacing={0}>
            {rows.map((row) => <NameRow key={row.docId ?? row.fqdn} row={row} />)}
            {outside > 0 ? (
              <Text role="status" fontSize="xs" color="orange.300" pt={1}>
                Hid {outside} returned name{outside === 1 ? '' : 's'} not starting with <code>{normalized}</code>.
              </Text>
            ) : null}
            {docs.length === INLINE_PREFIX_LIMIT ? (
              <Text fontSize="xs" color="muted" pt={1}>Showing the first {INLINE_PREFIX_LIMIT}.</Text>
            ) : null}
          </VStack>
        )}
      </VStack>
    </InfoBlock>
  );
}
