'use client';

import { Box, Flex, HStack, Skeleton, Text, Tooltip, VStack } from '@chakra-ui/react';
import { useMemo } from 'react';
import NextLink from 'next/link';
import { Eyebrow } from '@ui/Eyebrow';
import { useSdk } from '@sdk/hooks';
import { useNetworkHealth, type HealthLevel } from '@sdk/health';
import {
  useCurrentEpoch,
  useCurrentQuorumsInfo,
  useSystemStatus,
} from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';

function Field({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <HStack spacing={0} align="stretch" h="100%">
      <VStack align="flex-start" spacing="2px" justify="center" px={{ base: 3, md: 4 }} py={2}>
        <Eyebrow size="9px" tracking="0.16em">
          {label}
        </Eyebrow>
        <Box>{children}</Box>
      </VStack>
      {divider ? <Box w="1px" bg="hairline" /> : null}
    </HStack>
  );
}

const HEALTH_PRESENTATION: Record<
  Exclude<HealthLevel, 'unknown'>,
  { label: string; color: string; summary: string }
> = {
  healthy: {
    label: 'Live',
    color: 'verified',
    summary: 'Platform is producing blocks and tracking Core.',
  },
  degraded: {
    label: 'Lagging',
    color: 'warning',
    summary: 'Platform is falling behind Core or slow to produce blocks.',
  },
  stale: {
    label: 'Stalled',
    color: 'failed',
    summary: 'Platform consensus appears stuck while Core keeps advancing.',
  },
};

function getQuorumsCount(raw: unknown): number | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length;
  if (raw instanceof Map) return raw.size;
  const qt = readProp<unknown[]>(raw, 'quorums');
  return Array.isArray(qt) ? qt.length : null;
}

export function MeterBar() {
  const { network, trusted, status } = useSdk();
  const statusQ = useSystemStatus();
  const epochQ = useCurrentEpoch();
  const quorumsQ = useCurrentQuorumsInfo();
  const health = useNetworkHealth();

  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;

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

  const proofsOn = trusted && status === 'ready';
  const quorumsCount = getQuorumsCount(quorumsQ.data);
  const progress = epoch?.progressPct ?? null;

  const renderValue = (
    isLoading: boolean,
    error: Error | null,
    value: React.ReactNode,
    width = '40px',
  ): React.ReactNode => {
    if (isLoading) {
      return <Skeleton height="13px" width={width} startColor="sunken" endColor="raised" />;
    }
    if (error) {
      return (
        <Tooltip label={error.message} hasArrow placement="bottom" openDelay={200} bg="failed" color="bg">
          <Text fontFamily="mono" fontSize="13px" color="failed" cursor="help">
            error
          </Text>
        </Tooltip>
      );
    }
    return value;
  };

  return (
    <Box
      as="div"
      position="sticky"
      top={0}
      zIndex={15}
      borderBottom="1px solid"
      borderColor="hairline"
      bg="bg"
      h="40px"
      overflow="hidden"
    >
      <Flex h="100%" align="stretch" justify="flex-start" overflowX="auto">
        <Field label="Block">
          {renderValue(
            statusQ.isLoading,
            statusQ.error,
            <Text fontFamily="mono" fontSize="13px" color="ink" data-mono>
              {blockHeight !== undefined ? String(blockHeight) : '—'}
            </Text>,
            '60px',
          )}
        </Field>

        <Field label="Epoch">
          <HStack spacing={2}>
            {renderValue(
              epochQ.isLoading,
              epochQ.error,
              <Text fontFamily="mono" fontSize="13px" color="ink">
                #{epoch?.index ?? '—'}
              </Text>,
              '34px',
            )}
            {/* Progress meter only when we actually know start/end times —
                otherwise an empty track read as a broken widget. */}
            {progress != null ? (
              <>
                <Box
                  position="relative"
                  w="72px"
                  h="5px"
                  bg="sunken"
                  borderRadius="badge"
                  overflow="hidden"
                >
                  <Box
                    position="absolute"
                    inset="0 auto 0 0"
                    w={`${progress}%`}
                    bg="accent"
                    transition="width 0.5s ease"
                  />
                </Box>
                <Text fontFamily="mono" fontSize="11px" color="muted" minW="30px">
                  {progress.toFixed(0)}%
                </Text>
              </>
            ) : null}
          </HStack>
        </Field>

        <Field label="Proofs">
          <HStack spacing={1.5}>
            <Text
              as="span"
              color={proofsOn ? 'verified' : 'trusted'}
              fontSize="10px"
              lineHeight={1}
            >
              ●
            </Text>
            <Text fontFamily="mono" fontSize="13px" color="ink">
              {proofsOn ? 'ON' : 'OFF'}
            </Text>
          </HStack>
        </Field>

        <Field label="Quorums" divider={false}>
          {renderValue(
            quorumsQ.isLoading,
            quorumsQ.error,
            <Text fontFamily="mono" fontSize="13px" color="ink">
              {quorumsCount ?? '—'}
            </Text>,
            '26px',
          )}
        </Field>

        {/* Push network identity + health to the right edge so the strip reads
            as an instrument panel — live telemetry left, context right — rather
            than a left-justified run trailing into dead space. */}
        <Box flex="1" minW={4} />
        <Box w="1px" bg="hairline" />

        <Field label="Platform">
          {health.level === 'unknown' ? (
            <HStack spacing={1.5}>
              <Text as="span" color="muted" fontSize="10px" lineHeight={1}>
                ●
              </Text>
              <Text fontFamily="mono" fontSize="13px" color="muted">
                —
              </Text>
            </HStack>
          ) : (
            (() => {
              const hp = HEALTH_PRESENTATION[health.level];
              const tooltip = (
                <VStack align="flex-start" spacing={1} py={1}>
                  <Text fontWeight={600}>{hp.summary}</Text>
                  {health.reasons.map((r) => (
                    <Text key={r} fontSize="xs">
                      • {r}
                    </Text>
                  ))}
                  {health.coreHeight !== null ? (
                    <Text fontSize="xs" color="muted">
                      Core tip {health.coreHeight.toLocaleString()} · Platform chainlock{' '}
                      {health.coreChainLockedHeight?.toLocaleString() ?? '—'}
                    </Text>
                  ) : !health.insightAvailable ? (
                    <Text fontSize="xs" color="muted">
                      No Insight endpoint for this network — Core cross-check unavailable.
                    </Text>
                  ) : null}
                </VStack>
              );
              return (
                <Tooltip label={tooltip} hasArrow placement="bottom" openDelay={200}>
                  <HStack
                    as={NextLink}
                    href="/network/status"
                    spacing={1.5}
                    _hover={{ opacity: 0.75 }}
                  >
                    <Text as="span" color={hp.color} fontSize="10px" lineHeight={1}>
                      ●
                    </Text>
                    <Text fontFamily="mono" fontSize="13px" color="ink">
                      {hp.label}
                    </Text>
                  </HStack>
                </Tooltip>
              );
            })()
          )}
        </Field>

        <Field label="Network" divider={false}>
          <Text fontFamily="mono" fontSize="13px" color="ink">
            {network}
          </Text>
        </Field>
      </Flex>
    </Box>
  );
}
