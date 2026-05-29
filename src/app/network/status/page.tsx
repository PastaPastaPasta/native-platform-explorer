'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { Identifier } from '@components/data/Identifier';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentQuorumsInfo, useSystemStatus } from '@sdk/queries';
import {
  CORE_LAG_DEGRADED,
  CORE_LAG_STALE,
  extractPlatformStatus,
  useCoreStatus,
  useNetworkHealth,
  type HealthLevel,
  type NetworkHealth,
} from '@sdk/health';
import { toPlain } from '@util/contract';
import { getTimeDelta } from '@util/datetime';

function Uptime({ lastBlockTimeMs }: { lastBlockTimeMs: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const d = getTimeDelta(lastBlockTimeMs);
  const abs = new Date(lastBlockTimeMs).toLocaleString();
  return (
    <VStack align="flex-start" spacing={0}>
      <Text fontFamily="mono" fontSize="md" color="gray.100">
        {d?.short ?? '—'}
      </Text>
      <Text fontSize="2xs" color="gray.400">
        {abs}
      </Text>
    </VStack>
  );
}

const HEALTH_BANNER: Record<
  Exclude<HealthLevel, 'unknown'>,
  { label: string; color: string; headline: string }
> = {
  healthy: {
    label: 'Live',
    color: 'green',
    headline: 'Platform is producing blocks and tracking Core.',
  },
  degraded: {
    label: 'Lagging',
    color: 'yellow',
    headline: 'Platform is falling behind Core or slow to produce blocks.',
  },
  stale: {
    label: 'Stalled',
    color: 'red',
    headline: 'Platform consensus appears stuck while Core keeps advancing.',
  },
};

function coreLagColor(lag: number): string {
  if (lag >= CORE_LAG_STALE) return 'danger';
  if (lag >= CORE_LAG_DEGRADED) return 'warning';
  return 'gray.400';
}

function HealthBanner({ health }: { health: NetworkHealth }) {
  if (health.level === 'unknown') return null;
  const b = HEALTH_BANNER[health.level];
  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between" flexWrap="wrap" spacing={3}>
          <Heading size="sm" color="gray.100">
            Platform liveness
          </Heading>
          <Badge colorScheme={b.color} variant="subtle" textTransform="none">
            {b.label}
          </Badge>
        </HStack>
        <Text fontSize="sm" color="gray.300">
          {b.headline}
        </Text>
        {health.reasons.length > 0 ? (
          <VStack align="flex-start" spacing={0.5}>
            {health.reasons.map((r) => (
              <Text key={r} fontSize="xs" color="gray.400">
                • {r}
              </Text>
            ))}
          </VStack>
        ) : null}
        {!health.insightAvailable ? (
          <Text fontSize="xs" color="gray.500">
            No Insight endpoint configured for this network — Core cross-check unavailable.
          </Text>
        ) : null}
      </VStack>
    </InfoBlock>
  );
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Status' }]);

  const statusQ = useSystemStatus();
  const quorumsQ = useCurrentQuorumsInfo();
  const coreQ = useCoreStatus();
  const health = useNetworkHealth();

  // system.status() returns a wasm-bindgen class whose sub-fields are also
  // wasm instances. extractPlatformStatus coerces the tree to plain JSON and
  // pulls the flat fields we display (last-block time comes from `time.block`,
  // not `chain.*`).
  const s = useMemo(() => extractPlatformStatus(statusQ.data), [statusQ.data]);
  const plain = useMemo(
    () => (statusQ.data ? ((toPlain(statusQ.data) as Record<string, unknown>) ?? {}) : {}),
    [statusQ.data],
  );

  const version = (plain.version ?? plain.versions) as unknown;
  const stateSync = (plain.stateSync as Record<string, unknown> | undefined) ?? {};

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <HStack justify="space-between" flexWrap="wrap" spacing={3}>
            <Heading size="md" color="gray.100">
              Network status
            </Heading>
            <HStack spacing={2}>
              <Badge
                colorScheme={s.isCatchingUp ? 'yellow' : 'green'}
                variant="subtle"
                textTransform="none"
              >
                {s.isCatchingUp ? 'catching up' : 'in sync'}
              </Badge>
              <Badge
                colorScheme={s.isListening ? 'green' : 'gray'}
                variant="subtle"
                textTransform="none"
              >
                {s.isListening ? 'listening' : 'not listening'}
              </Badge>
            </HStack>
          </HStack>
        </InfoBlock>

        <HealthBanner health={health} />

        {statusQ.isLoading ? (
          <LoadingCard />
        ) : statusQ.isError ? (
          <ErrorCard error={statusQ.error} onRetry={() => statusQ.refetch()} />
        ) : (
          <>
            {(() => {
              const cards: React.ReactNode[] = [];
              if (s.latestBlockHeight !== null) {
                cards.push(
                  <InfoBlock key="height">
                    <InfoLine
                      label="Platform block height"
                      value={
                        <Text fontFamily="mono" fontSize="xl" color="gray.100">
                          {s.latestBlockHeight.toLocaleString()}
                        </Text>
                      }
                    />
                  </InfoBlock>,
                );
              }
              if (s.coreChainLockedHeight !== null) {
                cards.push(
                  <InfoBlock key="cl">
                    <Tooltip
                      hasArrow
                      label="Highest Core (L1) block height this Platform node has chain-locked. Should track the Core tip closely; a large gap means Platform's view of Core is stale."
                    >
                      <div>
                        <InfoLine
                          label="Core chainlocked height"
                          value={
                            <Text fontFamily="mono" fontSize="xl" color="gray.100">
                              {s.coreChainLockedHeight.toLocaleString()}
                            </Text>
                          }
                        />
                      </div>
                    </Tooltip>
                  </InfoBlock>,
                );
              }
              if (health.coreHeight !== null) {
                const lag = health.coreLag;
                cards.push(
                  <InfoBlock key="core-tip">
                    <Tooltip
                      hasArrow
                      label="Current Core (L1) tip height reported by the Insight API. Compared against the Platform chainlocked height to detect a stalled Platform."
                    >
                      <div>
                        <InfoLine
                          label="Core tip (Insight)"
                          value={
                            <VStack align="flex-start" spacing={0}>
                              <Text fontFamily="mono" fontSize="xl" color="gray.100">
                                {health.coreHeight.toLocaleString()}
                              </Text>
                              {lag !== null ? (
                                <Text fontSize="2xs" color={coreLagColor(lag)}>
                                  {lag <= 0 ? 'in lockstep' : `${lag} ahead of chainlock`}
                                </Text>
                              ) : null}
                            </VStack>
                          }
                        />
                      </div>
                    </Tooltip>
                  </InfoBlock>,
                );
              }
              if (s.chainId) {
                cards.push(
                  <InfoBlock key="chainId">
                    <InfoLine
                      label="Chain ID"
                      value={
                        <Text fontFamily="mono" fontSize="xl" color="gray.100">
                          {s.chainId}
                        </Text>
                      }
                    />
                  </InfoBlock>,
                );
              }
              if (s.peers !== null) {
                cards.push(
                  <InfoBlock key="peers">
                    <Tooltip
                      hasArrow
                      label="Number of other masternodes this particular node is currently gossiping with at the Tenderdash P2P layer. Local to the responding node — not a network-wide total."
                    >
                      <div>
                        <InfoLine
                          label="Peers (this node)"
                          value={
                            <Text fontFamily="mono" fontSize="xl" color="gray.100">
                              {s.peers}
                            </Text>
                          }
                        />
                      </div>
                    </Tooltip>
                  </InfoBlock>,
                );
              }
              if (s.latestBlockMs !== null) {
                cards.push(
                  <InfoBlock key="last-block">
                    <InfoLine
                      label="Last Platform block"
                      value={<Uptime lastBlockTimeMs={s.latestBlockMs} />}
                    />
                  </InfoBlock>,
                );
              }
              if (cards.length === 0) return null;
              const cols = Math.min(cards.length, 4);
              return (
                <SimpleGrid columns={{ base: 1, md: Math.min(cols, 2), lg: cols }} spacing={3}>
                  {cards}
                </SimpleGrid>
              );
            })()}

            {(s.latestBlockHash || s.proTxHash) ? (
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
                {s.latestBlockHash ? (
                  <InfoBlock>
                    <InfoLine
                      label="Latest block hash"
                      value={<Identifier value={s.latestBlockHash} avatar={false} dense copy />}
                    />
                  </InfoBlock>
                ) : null}
                {s.proTxHash ? (
                  <InfoBlock>
                    <InfoLine
                      label="This node's proTxHash"
                      value={<Identifier value={s.proTxHash} avatar={false} dense copy />}
                    />
                  </InfoBlock>
                ) : null}
              </SimpleGrid>
            ) : null}

            <InfoBlock>
              <Heading size="sm" color="gray.100" mb={3}>
                Software + protocol versions
              </Heading>
              <CodeBlock value={version ?? {}} collapsedHeight={160} />
            </InfoBlock>

            {Object.keys(stateSync).length > 0 ? (
              <InfoBlock>
                <Heading size="sm" color="gray.100" mb={3}>
                  State sync
                </Heading>
                <CodeBlock value={stateSync} collapsedHeight={120} />
              </InfoBlock>
            ) : null}

            <InfoBlock>
              <Heading size="sm" color="gray.100" mb={3}>
                Full status response
              </Heading>
              <CodeBlock value={plain} collapsedHeight={160} />
            </InfoBlock>
          </>
        )}

        {coreQ.isError ? (
          <Text fontSize="xs" color="gray.500">
            Insight Core status unavailable: {coreQ.error?.message}
          </Text>
        ) : null}

        <InfoBlock>
          <HStack justify="space-between" mb={3}>
            <Heading size="sm" color="gray.100">
              Current quorums (summary)
            </Heading>
          </HStack>
          {quorumsQ.isLoading ? (
            <LoadingCard lines={3} />
          ) : quorumsQ.isError ? (
            <ErrorCard error={quorumsQ.error} onRetry={() => quorumsQ.refetch()} />
          ) : (
            <CodeBlock value={quorumsQ.data ?? 'No quorums reported.'} />
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
