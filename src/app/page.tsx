'use client';

import {
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useMemo } from 'react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { GlobalSearchInput } from '@components/search/GlobalSearchInput';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { Identifier } from '@components/data/Identifier';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useCurrentEpoch,
  useCurrentQuorumsInfo,
  useEvonodesBlocksByRange,
  useProtocolVersionUpgradeState,
  useSystemStatus,
  useTotalCreditsInPlatform,
  useVotePollsByEndDate,
} from '@sdk/queries';
import { WELL_KNOWN } from '@constants/well-known';
import { useSdk } from '@sdk/hooks';
import { evonodesMapToBars, normaliseEpoch } from '@util/epoch';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';

function getQuorumsCount(raw: unknown): number | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length;
  if (raw instanceof Map) return raw.size;
  const qt = readProp<unknown[]>(raw, 'quorums');
  return Array.isArray(qt) ? qt.length : null;
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={2}>
        <Text
          fontSize="11px"
          fontWeight={500}
          color="gray.400"
          textTransform="uppercase"
          letterSpacing="0.06em"
        >
          {label}
        </Text>
        {children}
      </VStack>
    </InfoBlock>
  );
}

export default function HomePage() {
  usePageBreadcrumbs([]);
  const { network, trusted } = useSdk();

  const statusQ = useSystemStatus();
  const epochQ = useCurrentEpoch();
  const creditsQ = useTotalCreditsInPlatform();
  const protocolQ = useProtocolVersionUpgradeState();
  const quorumsQ = useCurrentQuorumsInfo();

  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;
  const evonodesQ = useEvonodesBlocksByRange(epoch?.index, 20);
  const bars = evonodesMapToBars(evonodesQ.data);

  // Round to minute granularity so the queryKey is stable across renders —
  // otherwise the fresh Date.now() on every render invalidates the cache.
  const nowBucket = Math.floor(Date.now() / 60_000) * 60_000;
  const in30d = nowBucket + 30 * 86_400_000;
  const pollsQ = useVotePollsByEndDate(nowBucket, in30d);
  const polls = (pollsQ.data as unknown[] | undefined) ?? [];

  // system.status() returns a nested WASM class — coerce to plain JSON and
  // read block height from the `chain` sub-object (same approach as /network/status).
  const statusPlain = useMemo(
    () => (statusQ.data ? ((toPlain(statusQ.data) as Record<string, unknown>) ?? {}) : {}),
    [statusQ.data],
  );
  const chain = (statusPlain.chain as Record<string, unknown> | undefined) ?? {};
  const blockHeight =
    (chain.latestBlockHeight as number | bigint | undefined) ??
    (chain.blockHeight as number | bigint | undefined) ??
    (chain.height as number | bigint | undefined) ??
    readProp<number | bigint>(statusPlain, 'height');
  const statusNetwork = (statusPlain.network as Record<string, unknown> | undefined) ?? {};
  const chainId = (statusNetwork.chainId as string | undefined) ?? readProp<string>(statusPlain, 'chainId');
  const quorumsCount = getQuorumsCount(quorumsQ.data);

  const protocolCurrent = readProp<unknown>(protocolQ.data, 'currentProtocolVersion');
  const protocolPending = readProp<unknown>(protocolQ.data, 'nextProtocolVersion');

  return (
    <Container py={{ base: 2, md: 6 }}>
      <VStack align="stretch" spacing={6}>
        {/* Hero */}
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={4}>
            <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} color="gray.100" fontWeight={700}>
              A proof-verified, client-only Dash Platform explorer.
            </Heading>
            <Text color="gray.300" fontSize="md" lineHeight="tall">
              Every piece of data on this site is fetched live by{' '}
              <Box as="code" color="brand.light" fontSize="sm" fontWeight={500}>@dashevo/evo-sdk</Box>{' '}
              running directly in your browser.
            </Text>
            <HStack spacing={3}>
              <Text fontSize="xs" color="gray.500" textTransform="uppercase" fontWeight={500} letterSpacing="0.05em">
                Network
              </Text>
              <Text fontSize="xs" color="brand.light" fontWeight={600}>
                {network}
              </Text>
              {trusted ? (
                <Text fontSize="xs" color="success" fontWeight={600}>
                  · proofs on
                </Text>
              ) : (
                <Text fontSize="xs" color="gray.400" fontWeight={600}>
                  · proofs off
                </Text>
              )}
            </HStack>
            <GlobalSearchInput width="100%" />
          </VStack>
        </InfoBlock>

        {/* Stat cards */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} spacing={3}>
          <StatCard label="Block height">
            {statusQ.isLoading ? (
              <Progress size="xs" isIndeterminate colorScheme="blue" borderRadius="full" />
            ) : (
              <Text fontFamily="mono" fontSize="xl" fontWeight={500} color="gray.100">
                {blockHeight !== undefined ? String(blockHeight) : '—'}
              </Text>
            )}
          </StatCard>

          <StatCard label="Current epoch">
            {epochQ.isLoading ? (
              <Progress size="xs" isIndeterminate colorScheme="blue" borderRadius="full" />
            ) : (
              <VStack align="flex-start" spacing={1} w="full">
                <Text
                  as={NextLink}
                  href="/epoch/"
                  fontFamily="mono"
                  fontSize="xl"
                  fontWeight={500}
                  color="brand.light"
                  _hover={{ color: 'brand.light' }}
                >
                  #{epoch?.index ?? '—'}
                </Text>
                {epoch?.progressPct != null ? (
                  <Progress
                    value={epoch.progressPct}
                    colorScheme="blue"
                    size="xs"
                    width="100%"
                    borderRadius="full"
                    bg="whiteAlpha.100"
                  />
                ) : null}
              </VStack>
            )}
          </StatCard>

          <StatCard label="Total credits">
            <CreditsBlock credits={(creditsQ.data as bigint | undefined) ?? null} />
          </StatCard>

          <StatCard label="Protocol version">
            <VStack align="flex-start" spacing={1}>
              <Text fontFamily="mono" fontSize="xl" fontWeight={500} color="gray.100">
                {protocolCurrent !== undefined ? String(protocolCurrent) : '—'}
              </Text>
              {protocolPending ? (
                <Text fontSize="xs" color="warning" fontWeight={500}>
                  upgrade → {String(protocolPending)}
                </Text>
              ) : null}
            </VStack>
          </StatCard>

          <StatCard label="Active quorums">
            <Text fontFamily="mono" fontSize="xl" fontWeight={500} color="gray.100">
              {quorumsCount ?? '—'}
            </Text>
          </StatCard>
        </SimpleGrid>

        {/* Top proposers */}
        <InfoBlock>
          <HStack justify="space-between" mb={3}>
            <Heading size="sm" color="gray.100" fontWeight={600}>
              Top proposers this epoch
            </Heading>
            <Button as={NextLink} href="/epoch/" size="xs" variant="outline" borderColor="whiteAlpha.200" _hover={{ borderColor: 'whiteAlpha.400', bg: 'whiteAlpha.50' }}>
              View epoch
            </Button>
          </HStack>
          {evonodesQ.isLoading ? (
            <LoadingCard lines={5} />
          ) : (
            <EvonodesLeaderboard entries={bars} limit={10} />
          )}
        </InfoBlock>

        {/* Bottom grid */}
        <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4}>
          <InfoBlock>
            <HStack justify="space-between" mb={3}>
              <Heading size="sm" color="gray.100" fontWeight={600}>
                Vote polls ending soon
              </Heading>
              <Button as={NextLink} href="/governance/polls/" size="xs" variant="outline" borderColor="whiteAlpha.200" _hover={{ borderColor: 'whiteAlpha.400', bg: 'whiteAlpha.50' }}>
                All polls
              </Button>
            </HStack>
            {pollsQ.isLoading ? (
              <LoadingCard lines={3} />
            ) : polls.length === 0 ? (
              <Text color="gray.500" fontSize="sm">
                No polls ending in the next 30 days.
              </Text>
            ) : (
              <VotePollsList entries={polls.slice(0, 10)} />
            )}
          </InfoBlock>

          <InfoBlock>
            <Heading size="sm" color="gray.100" mb={4} fontWeight={600}>
              Well-known contracts
            </Heading>
            <VStack align="stretch" spacing={2}>
              {WELL_KNOWN.map((w) => (
                <Box
                  key={w.id}
                  as={NextLink}
                  href={`/contract/?id=${encodeURIComponent(w.id)}`}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  px={4}
                  py={3}
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="rgba(255,255,255,0.06)"
                  bg="rgba(46,57,61,0.25)"
                  _hover={{ borderColor: 'rgba(0,141,228,0.3)', bg: 'rgba(46,57,61,0.4)' }}
                  transition="all 0.2s ease"
                >
                  <Text fontSize="sm" fontWeight={600} color="gray.100">
                    {w.name}
                  </Text>
                  <Identifier value={w.id} dense avatar={false} copy={false} />
                </Box>
              ))}
            </VStack>
          </InfoBlock>
        </Grid>

        <Text fontSize="xs" color="gray.500" textAlign="center" fontFamily="mono">
          {chainId ?? '—'}
        </Text>
      </VStack>
    </Container>
  );
}
