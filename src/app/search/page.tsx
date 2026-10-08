'use client';

import { useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import { Suspense, useMemo } from 'react';
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
import { ErrorCard } from '@ui/ErrorCard';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';
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
  useIdentitiesByNonUniquePkh,
} from '@sdk/queries';

interface ResolvedMatch {
  kind: string;
  href: string;
  primary: string;
  confirmed?: boolean;
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
  complete: boolean;
  requiresLookup: boolean;
  failures: Array<{ kind: string; error: Error }>;
  retry: () => void;
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
  const nonUniquePkh = pkhQ.isSuccess && !hasResult(pkhQ.data) ? pkh?.pkh : undefined;
  const nonUniqueQ = useIdentitiesByNonUniquePkh(nonUniquePkh);
  const dpnsQ = useDpnsGetByName(dpns?.name);

  const lookups = [
    { value: identity?.id, query: identityQ, kind: 'Identity', path: '/identity/', param: 'id' },
    { value: contract?.id, query: contractQ, kind: 'Contract', path: '/contract/', param: 'id' },
    { value: token?.id, query: tokenQ, kind: 'Token', path: '/token/', param: 'id' },
    { value: address?.addr, query: addressQ, kind: 'Address', path: '/address/', param: 'addr' },
    { value: pkh?.pkh, query: pkhQ, kind: 'Identity by public-key hash', path: '/identity/lookup/', param: 'pkh' },
    { value: nonUniquePkh, query: nonUniqueQ, kind: 'Identities by non-unique public-key hash', path: '/identity/lookup/', param: 'pkh' },
    { value: dpns?.name, query: dpnsQ, kind: 'DPNS', path: '/dpns/', param: 'name' },
  ].filter((lookup) => lookup.value !== undefined);
  const matches: ResolvedMatch[] = lookups
    .filter(({ query }) => hasResult(query.data))
    .map(({ value, kind, path, param }) => ({
      kind,
      confirmed: true,
      href: `${path}?${param}=${encodeURIComponent(value!)}`,
      primary: value!,
    }));

  // Always-present static links that the user might want regardless of resolution:
  const stHash = findByKind(candidates, 'stateTransition');
  if (stHash) {
    matches.push({
      kind: 'State transition',
      href: `/state-transition/?hash=${encodeURIComponent(stHash.hash)}`,
      primary: stHash.hash,
    });
  }
  const evonode = findByKind(candidates, 'evonode');
  if (evonode) {
    matches.push({
      kind: 'Evonode',
      href: `/evonode/?proTxHash=${encodeURIComponent(evonode.proTxHash)}`,
      primary: evonode.proTxHash,
    });
  }
  const epoch = findByKind(candidates, 'epoch');
  if (epoch) {
    matches.push({
      kind: 'Epoch',
      href: `/epoch/detail/?index=${epoch.index}`,
      primary: String(epoch.index),
    });
  }

  const failures = lookups.filter(({ query }) => query.isError).map(({ query, kind }) => ({
    kind,
    error: query.error ?? new Error('The lookup could not be completed.'),
  }));
  const loading = lookups.some(({ query }) => query.isLoading);
  const complete = lookups.every(({ query }) => query.isSuccess);
  const retry = () => {
    for (const { query } of lookups) {
      if (query.isError) void query.refetch();
    }
  };

  return { matches, loading, complete, failures, retry, requiresLookup: lookups.length > 0 };
}

function hasResult(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (data instanceof Map) return data.size > 0;
  return true;
}

function SearchContent() {
  const params = useSearchParams();
  const { network, status, error, reconnect } = useSdk();
  const q = params.get('q') ?? '';

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Search' }]);

  const classification = useMemo(() => classifyQuery(q), [q]);
  const { matches, loading, complete, failures, retry, requiresLookup } = useResolveCandidates(classification.candidates);
  const unavailable = requiresLookup && status === 'error';
  const prefix = findByKind(classification.candidates, 'dpnsPrefix');

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
            <GlobalSearchInput width="100%" autoFocus initialValue={q} />
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

        {!classification.raw ? (
          <InfoBlock>
            <Text color="muted">Enter a query to start exploring.</Text>
          </InfoBlock>
        ) : classification.candidates.length === 0 ? (
          <NotFoundCard
            title="Invalid search input"
            description="This input does not match a supported identifier, name, address, hash, or epoch index. Check the format and try again."
            actions={[{ label: 'Search rules', href: '/about/' }]}
          />
        ) : null}

        {unavailable ? (
          <ErrorCard title="Search unavailable" error={error ?? new Error('The SDK could not connect to the selected network.')} onRetry={reconnect} />
        ) : failures.length > 0 ? (
          <VStack align="stretch" spacing={2}>
            <ErrorCard
              title="Some lookups could not be completed"
              error={new Error(failures.map((failure) => `${failure.kind}: ${failure.error.message}`).join(' · '))}
              onRetry={retry}
            />
            <Text fontSize="sm" color="muted">A failed lookup does not establish that the entity is missing.</Text>
          </VStack>
        ) : null}

        {loading && !unavailable ? <LoadingCard lines={3} /> : null}
        {complete && !loading && !unavailable && failures.length === 0 && classification.candidates.length > 0 && matches.length === 0 ? (
          <NotFoundCard
            title="No matching entity found"
            description={`The lookups completed successfully but returned no entity on ${network}. Check the identifier or select another network.`}
            actions={[{ label: 'Change network', href: '/settings/' }]}
          />
        ) : null}
        {matches.length > 0 && !unavailable ? (
          <InfoBlock>
            <VStack align="stretch" spacing={3}>
              <Heading size="sm" color="gray.100">
                Matches and possible destinations
              </Heading>
              <Wrap spacing={3}>
                {matches.map((m) => (
                  <WrapItem key={`${m.kind}-${m.primary}`}>
                    <Button
                      as={NextLink}
                      href={withNetwork(m.href, network)}
                      aria-label={`Open ${m.kind} ${m.primary} on ${network}`}
                      variant="outline"
                      colorScheme="blue"
                      size="md"
                      height="auto"
                      py={2}
                    >
                      <VStack align="flex-start" spacing={1}>
                        <Text fontSize="2xs" color="gray.400" textTransform="uppercase">
                          {m.kind}{m.confirmed ? '' : ' · open lookup'}
                        </Text>
                        <Identifier value={m.primary} avatar={false} copy={false} dense />
                      </VStack>
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </VStack>
          </InfoBlock>
        ) : null}
        {prefix ? (
          <Button as={NextLink} href={withNetwork(`/dpns/search/?q=${encodeURIComponent(prefix.prefix)}`, network)} alignSelf="start" variant="outline">
            Find DPNS names with this prefix
          </Button>
        ) : null}
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
