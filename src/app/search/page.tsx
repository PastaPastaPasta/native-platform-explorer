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

function findByKind<K extends SearchCandidate['kind']>(
  candidates: SearchCandidate[],
  kind: K,
): Extract<SearchCandidate, { kind: K }> | undefined {
  return candidates.find((c): c is Extract<SearchCandidate, { kind: K }> => c.kind === kind);
}

function useResolveCandidates(candidates: SearchCandidate[]): {
  matches: ResolvedMatch[];
  loading: boolean;
} {
  // Collapse duplicate candidate IDs to stable hook inputs. React hooks must be
  // called unconditionally, so we always call the full hook set and just disable
  // the ones we do not need.
  const identity = findByKind(candidates, 'identity');
  const contract = findByKind(candidates, 'contract');
  const token = findByKind(candidates, 'token');
  const address = findByKind(candidates, 'address');
  const pkh = findByKind(candidates, 'identityByPkh');
  const dpns = findByKind(candidates, 'dpnsName');

  const identityQ = useIdentity(identity?.id);
  const contractQ = useContract(contract?.id);
  const tokenQ = useTokenTotalSupply(token?.id);
  const addressQ = useAddressInfo(address?.addr);
  const pkhQ = useIdentityByPublicKeyHash(pkh?.pkh);
  const dpnsQ = useDpnsGetByName(dpns?.name);

  const matches: ResolvedMatch[] = [];

  if (identity && identityQ.data) {
    matches.push({ kind: 'Identity', href: `/identity/${identity.id}/`, primary: identity.id });
  }
  if (contract && contractQ.data) {
    matches.push({ kind: 'Contract', href: `/contract/${contract.id}/`, primary: contract.id });
  }
  if (token && tokenQ.data) {
    matches.push({ kind: 'Token', href: `/token/${token.id}/`, primary: token.id });
  }
  if (address && addressQ.data) {
    matches.push({ kind: 'Address', href: `/address/${address.addr}/`, primary: address.addr });
  }
  if (pkh && pkhQ.data) {
    matches.push({
      kind: 'Identity (pkh)',
      href: `/identity/lookup/${pkh.pkh}/`,
      primary: pkh.pkh,
    });
  }
  if (dpns && dpnsQ.data) {
    matches.push({
      kind: 'DPNS',
      href: `/dpns/${encodeURIComponent(dpns.name)}/`,
      primary: dpns.name,
    });
  }

  // Always-present static links that the user might want regardless of resolution:
  const stHash = findByKind(candidates, 'stateTransition');
  if (stHash) {
    matches.push({
      kind: 'State transition',
      href: `/state-transition/${stHash.hash}/`,
      primary: stHash.hash,
    });
  }
  const evonode = findByKind(candidates, 'evonode');
  if (evonode) {
    matches.push({
      kind: 'Evonode',
      href: `/evonode/${evonode.proTxHash}/`,
      primary: evonode.proTxHash,
    });
  }
  const epoch = findByKind(candidates, 'epoch');
  if (epoch) {
    matches.push({
      kind: 'Epoch',
      href: `/epoch/${epoch.index}/`,
      primary: String(epoch.index),
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
