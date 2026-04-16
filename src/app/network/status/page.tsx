'use client';

import { useEffect, useMemo, useState } from 'react';
import { Heading, HStack, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentQuorumsInfo, useSystemStatus } from '@sdk/queries';
import { toPlain } from '@util/contract';
import { getTimeDelta } from '@util/datetime';

function Uptime({ lastBlockTimeMs }: { lastBlockTimeMs: number | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  if (lastBlockTimeMs === null) return <Text fontFamily="mono">—</Text>;
  const d = getTimeDelta(lastBlockTimeMs);
  return (
    <Text fontFamily="mono" fontSize="sm" color="gray.100">
      {d?.short ?? '—'}
    </Text>
  );
}

/** Safe string coercion that never hands React a WASM instance. Falls back
 *  to the em-dash for null/undefined/unstringifiable values. */
function showPrimitive(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') {
    return String(v);
  }
  // At this point v is an object — pull a plain form if possible, otherwise
  // JSON-stringify through the toPlain walker.
  const plain = toPlain(v);
  if (typeof plain === 'string') return plain;
  if (typeof plain === 'number' || typeof plain === 'bigint' || typeof plain === 'boolean') {
    return String(plain);
  }
  try {
    return JSON.stringify(plain);
  } catch {
    return '—';
  }
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Status' }]);

  const statusQ = useSystemStatus();
  const quorumsQ = useCurrentQuorumsInfo();

  // system.status() returns a WASM class. Coerce to plain so nested reads
  // produce primitives rather than wasm-bindgen pointer handles — otherwise
  // {__wbg_ptr} values leak into JSX and React throws "Objects are not valid
  // as a React child".
  const status = useMemo(
    () =>
      statusQ.data
        ? ((toPlain(statusQ.data) as Record<string, unknown>) ?? {})
        : {},
    [statusQ.data],
  );

  const height = status.height ?? status.coreHeight ?? status.latestBlockHeight;
  const chainId = status.chainId ?? status.chain;
  const version = (status.version as unknown) ?? status.versions ?? {};
  const network = status.network;
  const lastBlockTimeRaw = status.blockTime ?? status.latestBlockTime;
  const lastBlockTimeMs = (() => {
    if (lastBlockTimeRaw === null || lastBlockTimeRaw === undefined) return null;
    const n =
      typeof lastBlockTimeRaw === 'bigint'
        ? Number(lastBlockTimeRaw)
        : Number(lastBlockTimeRaw as number | string);
    if (!Number.isFinite(n)) return null;
    return n < 1e11 ? n * 1000 : n;
  })();

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Network status
          </Heading>
        </InfoBlock>

        {statusQ.isLoading ? (
          <LoadingCard />
        ) : statusQ.isError ? (
          <ErrorCard error={statusQ.error} onRetry={() => statusQ.refetch()} />
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
            <InfoBlock>
              <InfoLine
                label="Block height"
                value={
                  <Text fontFamily="mono" fontSize="xl" color="gray.100">
                    {showPrimitive(height)}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Chain id"
                value={
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {showPrimitive(chainId)}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Network"
                value={
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {showPrimitive(network)}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine label="Last block" value={<Uptime lastBlockTimeMs={lastBlockTimeMs} />} />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Versions"
                value={<CodeBlock value={version} collapsedHeight={120} />}
              />
            </InfoBlock>
          </SimpleGrid>
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
