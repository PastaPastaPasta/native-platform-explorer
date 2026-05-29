'use client';

import { Badge, HStack, Text, Tooltip, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useNetworkHealth, type HealthLevel } from '@sdk/health';

const PRESENTATION: Record<
  Exclude<HealthLevel, 'unknown'>,
  { label: string; color: string; summary: string }
> = {
  healthy: {
    label: 'Live',
    color: 'success',
    summary: 'Platform is producing blocks and tracking Core.',
  },
  degraded: {
    label: 'Lagging',
    color: 'warning',
    summary: 'Platform is falling behind Core or slow to produce blocks.',
  },
  stale: {
    label: 'Stalled',
    color: 'danger',
    summary: 'Platform consensus appears stuck while Core keeps advancing.',
  },
};

export function NetworkHealthBadge() {
  const health = useNetworkHealth();

  // Stay quiet until we have a verdict — no badge during the initial load.
  if (health.level === 'unknown') return null;

  const p = PRESENTATION[health.level];

  const tooltip = (
    <VStack align="flex-start" spacing={1} py={1}>
      <Text fontWeight={600}>{p.summary}</Text>
      {health.reasons.map((r) => (
        <Text key={r} fontSize="xs">
          • {r}
        </Text>
      ))}
      {health.coreHeight !== null ? (
        <Text fontSize="xs" color="gray.300">
          Core tip {health.coreHeight.toLocaleString()} · Platform chainlock{' '}
          {health.coreChainLockedHeight?.toLocaleString() ?? '—'}
        </Text>
      ) : !health.insightAvailable ? (
        <Text fontSize="xs" color="gray.400">
          No Insight endpoint for this network — Core cross-check unavailable.
        </Text>
      ) : null}
    </VStack>
  );

  return (
    <Tooltip label={tooltip} hasArrow placement="bottom-end">
      <HStack
        as={NextLink}
        href="/network/status"
        spacing={2}
        bg="gray.800"
        px={3}
        py={1}
        borderRadius="full"
        _hover={{ bg: 'gray.700' }}
      >
        <Text as="span" color={p.color} fontWeight={600} fontSize="xs">
          ●
        </Text>
        <Badge as="span" variant="subtle" bg="transparent" p={0}>
          <Text as="span" color="gray.100" fontSize="xs" textTransform="none">
            {p.label}
          </Text>
        </Badge>
      </HStack>
    </Tooltip>
  );
}
