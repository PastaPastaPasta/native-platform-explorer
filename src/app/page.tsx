'use client';

import {
  Button,
  Grid,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { GlobalSearchInput } from '@components/search/GlobalSearchInput';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { InfoLine } from '@components/data/InfoLine';
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
import { readProp } from '@util/sdk-shape';

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <InfoBlock>
      <InfoLine label={label} value={value} />
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

  const blockHeight = readProp<number | bigint>(statusQ.data, 'height');
  const chainId = readProp<string>(statusQ.data, 'chainId');
  const quorumsCount = (() => {
    const raw = quorumsQ.data;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw.length;
    if (raw instanceof Map) return raw.size;
    const qt = readProp<unknown[]>(raw, 'quorums');
    return Array.isArray(qt) ? qt.length : null;
  })();

  const protocolCurrent = readProp<unknown>(protocolQ.data, 'currentProtocolVersion');
  const protocolPending = readProp<unknown>(protocolQ.data, 'nextProtocolVersion');

  return (
    <Container py={{ base: 2, md: 6 }}>
      <VStack align="stretch" spacing={6}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={4}>
            <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} color="gray.100">
              A proof-verified, client-only Dash Platform explorer.
            </Heading>
            <Text color="gray.250" fontSize="md">
              Every piece of data on this site is fetched live by{' '}
              <code>@dashevo/evo-sdk</code> running directly in your browser.
            </Text>
            <HStack spacing={3}>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase">
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

        <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} spacing={3}>
          <Card
            label="Block height"
            value={
              statusQ.isLoading ? (
                <Progress size="xs" isIndeterminate colorScheme="blue" borderRadius="full" />
              ) : (
                <Text fontFamily="mono" fontSize="xl" color="gray.100">
                  {blockHeight !== undefined ? String(blockHeight) : '—'}
                </Text>
              )
            }
          />
          <Card
            label="Current epoch"
            value={
              epochQ.isLoading ? (
                <Progress size="xs" isIndeterminate colorScheme="blue" borderRadius="full" />
              ) : (
                <VStack align="flex-start" spacing={1}>
                  <Text
                    as={NextLink}
                    href="/epoch/"
                    fontFamily="mono"
                    fontSize="xl"
                    color="brand.light"
                    _hover={{ color: 'brand.light' }}
                  >
                    #{epoch?.index ?? '—'}
                  </Text>
                  {epoch?.progressPct !== null && epoch?.progressPct !== undefined ? (
                    <Progress
                      value={epoch.progressPct}
                      colorScheme="blue"
                      size="xs"
                      width="100%"
                      borderRadius="full"
                      bg="gray.800"
                    />
                  ) : null}
                </VStack>
              )
            }
          />
          <Card label="Total credits" value={<CreditsBlock credits={(creditsQ.data as bigint | undefined) ?? null} />} />
          <Card
            label="Protocol version"
            value={
              <VStack align="flex-start" spacing={1}>
                <Text fontFamily="mono" fontSize="xl" color="gray.100">
                  {protocolCurrent !== undefined ? String(protocolCurrent) : '—'}
                </Text>
                {protocolPending ? (
                  <Text fontSize="xs" color="warning">
                    upgrade → {String(protocolPending)}
                  </Text>
                ) : null}
              </VStack>
            }
          />
          <Card
            label="Active quorums"
            value={
              <Text fontFamily="mono" fontSize="xl" color="gray.100">
                {quorumsCount ?? '—'}
              </Text>
            }
          />
        </SimpleGrid>

        <InfoBlock>
          <HStack justify="space-between" mb={3}>
            <Heading size="sm" color="gray.100">
              Top proposers this epoch
            </Heading>
            <Button as={NextLink} href="/epoch/" size="xs" variant="outline">
              View epoch
            </Button>
          </HStack>
          {evonodesQ.isLoading ? (
            <LoadingCard lines={5} />
          ) : (
            <EvonodesLeaderboard entries={bars} limit={10} />
          )}
        </InfoBlock>

        <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4}>
          <InfoBlock>
            <HStack justify="space-between" mb={3}>
              <Heading size="sm" color="gray.100">
                Vote polls ending soon
              </Heading>
              <Button as={NextLink} href="/governance/polls/" size="xs" variant="outline">
                All polls
              </Button>
            </HStack>
            {pollsQ.isLoading ? (
              <LoadingCard lines={3} />
            ) : polls.length === 0 ? (
              <Text color="gray.400" fontSize="sm">
                No polls ending in the next 30 days.
              </Text>
            ) : (
              <VStack align="stretch" spacing={2}>
                {polls.slice(0, 10).map((poll, i) => (
                  <Text key={i} fontFamily="mono" fontSize="xs" color="gray.250">
                    {JSON.stringify(poll)}
                  </Text>
                ))}
              </VStack>
            )}
          </InfoBlock>

          <InfoBlock>
            <Heading size="sm" color="gray.100" mb={3}>
              Well-known contracts
            </Heading>
            <Wrap spacing={2}>
              {WELL_KNOWN.map((w) => (
                <WrapItem key={w.id}>
                  <Button
                    as={NextLink}
                    href={`/contract/?id=${encodeURIComponent(w.id)}`}
                    size="sm"
                    variant="outline"
                    colorScheme="blue"
                    height="auto"
                    py={2}
                  >
                    <VStack align="flex-start" spacing={0}>
                      <Text fontSize="xs" fontWeight={600}>
                        {w.name}
                      </Text>
                      <Identifier value={w.id} dense avatar={false} copy={false} />
                    </VStack>
                  </Button>
                </WrapItem>
              ))}
            </Wrap>
          </InfoBlock>
        </Grid>

        <Text fontSize="xs" color="gray.400" textAlign="center">
          Chain: {chainId ?? '—'}
        </Text>
      </VStack>
    </Container>
  );
}
