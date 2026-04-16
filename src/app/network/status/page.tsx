'use client';

import { useEffect, useState } from 'react';
import { Heading, HStack, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentQuorumsInfo, useSystemStatus } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';
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

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Status' }]);

  const statusQ = useSystemStatus();
  const quorumsQ = useCurrentQuorumsInfo();

  const status = statusQ.data;
  const height = readProp<number | bigint>(status, 'height') ?? readProp<number | bigint>(status, 'coreHeight');
  const chainId = readProp<string>(status, 'chainId');
  const version = readProp<unknown>(status, 'version');
  const network = readProp<string>(status, 'network');
  const lastBlockTimeRaw =
    readProp<number | bigint | string>(status, 'blockTime') ??
    readProp<number | bigint | string>(status, 'latestBlockTime');
  const lastBlockTimeMs =
    lastBlockTimeRaw !== undefined
      ? (() => {
          const n = typeof lastBlockTimeRaw === 'bigint' ? Number(lastBlockTimeRaw) : Number(lastBlockTimeRaw);
          return Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : null;
        })()
      : null;

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
                    {height !== undefined ? String(height) : '—'}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Chain id"
                value={
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {chainId ?? '—'}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Network"
                value={
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {network ?? '—'}
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
                value={<CodeBlock value={version ?? {}} collapsedHeight={120} />}
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
