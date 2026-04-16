'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { Suspense, useEffect, useMemo } from 'react';
import {
  Button,
  Heading,
  Text,
  VStack,
  Wrap,
  WrapItem,
  HStack,
  Badge,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { Identifier } from '@components/data/Identifier';
import { GlobalSearchInput } from '@components/search/GlobalSearchInput';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { classifyQuery, type SearchCandidate } from '@util/search';
import {
  useContract,
  useDpnsGetByName,
  useIdentity,
  useTokenTotalSupply,
  useAddressInfo,
  useIdentityByPublicKeyHash,
} from '@sdk/queries';

interface ResolvedMatch {
  kind: string;
  href: string;
  primary: string;
  secondary?: string;
}

function useResolveCandidates(candidates: SearchCandidate[]): {
  matches: ResolvedMatch[];
  loading: boolean;
} {
  // Collapse duplicate candidate IDs to stable hook inputs. React hooks must be
  // called unconditionally, so we always call the full hook set and just disable
  // the ones we do not need.
  const identityCandidate = candidates.find((c) => c.kind === 'identity');
  const contractCandidate = candidates.find((c) => c.kind === 'contract');
  const tokenCandidate = candidates.find((c) => c.kind === 'token');
  const addressCandidate = candidates.find((c) => c.kind === 'address');
  const pkhCandidate = candidates.find((c) => c.kind === 'identityByPkh');
  const dpnsCandidate = candidates.find((c) => c.kind === 'dpnsName');

  const identityQ = useIdentity(
    identityCandidate && identityCandidate.kind === 'identity' ? identityCandidate.id : undefined,
  );
  const contractQ = useContract(
    contractCandidate && contractCandidate.kind === 'contract' ? contractCandidate.id : undefined,
  );
  const tokenQ = useTokenTotalSupply(
    tokenCandidate && tokenCandidate.kind === 'token' ? tokenCandidate.id : undefined,
  );
  const addressQ = useAddressInfo(
    addressCandidate && addressCandidate.kind === 'address' ? addressCandidate.addr : undefined,
  );
  const pkhQ = useIdentityByPublicKeyHash(
    pkhCandidate && pkhCandidate.kind === 'identityByPkh' ? pkhCandidate.pkh : undefined,
  );
  const dpnsQ = useDpnsGetByName(
    dpnsCandidate && dpnsCandidate.kind === 'dpnsName' ? dpnsCandidate.name : undefined,
  );

  const matches: ResolvedMatch[] = [];

  if (identityCandidate && identityCandidate.kind === 'identity' && identityQ.data) {
    matches.push({
      kind: 'Identity',
      href: `/identity/${identityCandidate.id}/`,
      primary: identityCandidate.id,
    });
  }
  if (contractCandidate && contractCandidate.kind === 'contract' && contractQ.data) {
    matches.push({
      kind: 'Contract',
      href: `/contract/${contractCandidate.id}/`,
      primary: contractCandidate.id,
    });
  }
  if (tokenCandidate && tokenCandidate.kind === 'token' && tokenQ.data) {
    matches.push({
      kind: 'Token',
      href: `/token/${tokenCandidate.id}/`,
      primary: tokenCandidate.id,
    });
  }
  if (addressCandidate && addressCandidate.kind === 'address' && addressQ.data) {
    matches.push({
      kind: 'Address',
      href: `/address/${addressCandidate.addr}/`,
      primary: addressCandidate.addr,
    });
  }
  if (pkhCandidate && pkhCandidate.kind === 'identityByPkh' && pkhQ.data) {
    matches.push({
      kind: 'Identity (pkh)',
      href: `/identity/lookup/${pkhCandidate.pkh}/`,
      primary: pkhCandidate.pkh,
    });
  }
  if (dpnsCandidate && dpnsCandidate.kind === 'dpnsName' && dpnsQ.data) {
    matches.push({
      kind: 'DPNS',
      href: `/dpns/${encodeURIComponent(dpnsCandidate.name)}/`,
      primary: dpnsCandidate.name,
    });
  }

  // Always-present static links that the user might want regardless of resolution:
  const stHashCandidate = candidates.find((c) => c.kind === 'stateTransition');
  if (stHashCandidate && stHashCandidate.kind === 'stateTransition') {
    matches.push({
      kind: 'State transition',
      href: `/state-transition/${stHashCandidate.hash}/`,
      primary: stHashCandidate.hash,
    });
  }
  const evonodeCandidate = candidates.find((c) => c.kind === 'evonode');
  if (evonodeCandidate && evonodeCandidate.kind === 'evonode') {
    matches.push({
      kind: 'Evonode',
      href: `/evonode/${evonodeCandidate.proTxHash}/`,
      primary: evonodeCandidate.proTxHash,
    });
  }
  const epochCandidate = candidates.find((c) => c.kind === 'epoch');
  if (epochCandidate && epochCandidate.kind === 'epoch') {
    matches.push({
      kind: 'Epoch',
      href: `/epoch/${epochCandidate.index}/`,
      primary: String(epochCandidate.index),
    });
  }

  const loading =
    identityQ.isLoading ||
    contractQ.isLoading ||
    tokenQ.isLoading ||
    addressQ.isLoading ||
    pkhQ.isLoading ||
    dpnsQ.isLoading;

  return { matches, loading };
}

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') ?? '';

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Search' }]);

  const classification = useMemo(() => classifyQuery(q), [q]);
  const { matches, loading } = useResolveCandidates(classification.candidates);

  // Auto-redirect if there is exactly one resolved match.
  useEffect(() => {
    if (!loading && matches.length === 1) {
      const target = matches[0]!;
      const tid = window.setTimeout(() => router.replace(target.href), 250);
      return () => window.clearTimeout(tid);
    }
    return;
  }, [loading, matches, router]);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading as="h1" size="md" color="gray.100">
              Search
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Paste an identity ID, contract ID, token ID, address, DPNS name, tx hash,
              public-key hash, or epoch index.
            </Text>
            <GlobalSearchInput width="100%" autoFocus />
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <HStack>
              <Heading size="sm" color="gray.100">
                Query
              </Heading>
              <Badge colorScheme="blue" variant="subtle">
                {q || '—'}
              </Badge>
            </HStack>
            <Text fontSize="xs" color="gray.400">
              Classified as:{' '}
              {classification.candidates.length === 0
                ? 'nothing recognisable'
                : classification.candidates.map((c) => c.kind).join(', ')}
            </Text>
          </VStack>
        </InfoBlock>

        {loading ? (
          <LoadingCard lines={3} />
        ) : matches.length === 0 ? (
          <NotFoundCard
            title="No matches"
            description="We couldn't classify your query as any known Platform entity. Try a different string."
            actions={[
              { label: 'Return home', href: '/' },
              { label: 'Search rules', href: '/about/' },
            ]}
          />
        ) : (
          <InfoBlock>
            <VStack align="stretch" spacing={3}>
              <Heading size="sm" color="gray.100">
                Possible matches
              </Heading>
              <Wrap spacing={3}>
                {matches.map((m) => (
                  <WrapItem key={`${m.kind}-${m.primary}`}>
                    <Button
                      as={NextLink}
                      href={m.href}
                      variant="outline"
                      colorScheme="blue"
                      size="md"
                      height="auto"
                      py={2}
                    >
                      <VStack align="flex-start" spacing={1}>
                        <Text fontSize="2xs" color="gray.400" textTransform="uppercase">
                          {m.kind}
                        </Text>
                        <Identifier value={m.primary} avatar={false} copy={false} dense />
                      </VStack>
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </VStack>
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SearchContent />
    </Suspense>
  );
}
