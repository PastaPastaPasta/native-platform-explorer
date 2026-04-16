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

function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n =
      typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v as string);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Tolerant timestamp coercion. Accepts: number/bigint (seconds or ms auto-
 *  detected by magnitude), numeric string, ISO 8601 string (e.g.
 *  "2026-04-16T21:26:30Z" as Tenderdash returns), or null/undefined. */
function asMs(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    // ISO 8601 first — Date.parse handles common variants.
    const iso = Date.parse(v);
    if (Number.isFinite(iso)) return iso;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n < 1e11 ? n * 1000 : n;
  }
  const n = firstNum(v);
  if (n === null) return null;
  return n < 1e11 ? n * 1000 : n;
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Status' }]);

  const statusQ = useSystemStatus();
  const quorumsQ = useCurrentQuorumsInfo();

  // system.status() returns a wasm-bindgen class whose sub-fields are also
  // wasm instances. Coerce the whole tree to plain JSON once. The real shape
  // is nested: { chain, network, version, node, stateSync, time } — NOT a
  // flat record — so our earlier status.chainId / status.network reads were
  // pulling the wrong sub-objects.
  const plain = useMemo(
    () => (statusQ.data ? ((toPlain(statusQ.data) as Record<string, unknown>) ?? {}) : {}),
    [statusQ.data],
  );

  const chain = (plain.chain as Record<string, unknown> | undefined) ?? {};
  const network = (plain.network as Record<string, unknown> | undefined) ?? {};
  const version = (plain.version ?? plain.versions) as unknown;
  const node = (plain.node as Record<string, unknown> | undefined) ?? {};
  const stateSync = (plain.stateSync as Record<string, unknown> | undefined) ?? {};

  const height = firstNum(
    chain.latestBlockHeight,
    chain.blockHeight,
    chain.height,
    plain.height,
  );
  const chainIdStr = (network.chainId ?? plain.chainId ?? '') as string;
  const peers = firstNum(network.peersCount, plain.peersCount);
  const isListening = Boolean(network.isListening ?? plain.isListening);
  const isCatchingUp = Boolean(chain.isCatchingUp ?? plain.isCatchingUp);
  const latestBlockHash = (chain.latestBlockHash ?? plain.latestBlockHash) as
    | string
    | undefined;
  const latestBlockMs = asMs(
    chain.latestBlockTime ??
      chain.latestBlockTimestamp ??
      chain.blockTime ??
      chain.time ??
      chain.headerTime ??
      plain.latestBlockTime ??
      plain.blockTime ??
      plain.time,
  );
  const proTxHash = (node.proTxHash ?? plain.proTxHash) as string | undefined;

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
                colorScheme={isCatchingUp ? 'yellow' : 'green'}
                variant="subtle"
                textTransform="none"
              >
                {isCatchingUp ? 'catching up' : 'in sync'}
              </Badge>
              <Badge
                colorScheme={isListening ? 'green' : 'gray'}
                variant="subtle"
                textTransform="none"
              >
                {isListening ? 'listening' : 'not listening'}
              </Badge>
            </HStack>
          </HStack>
        </InfoBlock>

        {statusQ.isLoading ? (
          <LoadingCard />
        ) : statusQ.isError ? (
          <ErrorCard error={statusQ.error} onRetry={() => statusQ.refetch()} />
        ) : (
          <>
            {(() => {
              const cards: React.ReactNode[] = [];
              if (height !== null) {
                cards.push(
                  <InfoBlock key="height">
                    <InfoLine
                      label="Block height"
                      value={
                        <Text fontFamily="mono" fontSize="xl" color="gray.100">
                          {height.toLocaleString()}
                        </Text>
                      }
                    />
                  </InfoBlock>,
                );
              }
              if (chainIdStr) {
                cards.push(
                  <InfoBlock key="chainId">
                    <InfoLine
                      label="Chain ID"
                      value={
                        <Text fontFamily="mono" fontSize="xl" color="gray.100">
                          {chainIdStr}
                        </Text>
                      }
                    />
                  </InfoBlock>,
                );
              }
              if (peers !== null) {
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
                              {peers}
                            </Text>
                          }
                        />
                      </div>
                    </Tooltip>
                  </InfoBlock>,
                );
              }
              if (latestBlockMs !== null) {
                cards.push(
                  <InfoBlock key="last-block">
                    <InfoLine
                      label="Last block"
                      value={<Uptime lastBlockTimeMs={latestBlockMs} />}
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

            {(latestBlockHash || proTxHash) ? (
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
                {latestBlockHash ? (
                  <InfoBlock>
                    <InfoLine
                      label="Latest block hash"
                      value={<Identifier value={latestBlockHash} avatar={false} dense copy />}
                    />
                  </InfoBlock>
                ) : null}
                {proTxHash ? (
                  <InfoBlock>
                    <InfoLine
                      label="This node's proTxHash"
                      value={<Identifier value={proTxHash} avatar={false} dense copy />}
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
