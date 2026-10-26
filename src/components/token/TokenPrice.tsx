'use client';

import { Text, Tooltip } from '@chakra-ui/react';
import { formatCredits, formatDashAmount } from '@util/credits';
import { readProp } from '@util/sdk-shape';

export interface TokenPriceSummary {
  /** Price of the lowest amount tier (or the single price). */
  first: string;
  /** Price of the highest amount tier (or the single price). */
  last: string;
}

/**
 * rc.2 `TokenPriceInfo` flattens the pricing schedule: a single price fills
 * both fields; a tiered schedule reports the price of its lowest amount tier
 * as `basePrice` and its highest tier as `currentPrice`. The fields are not a
 * "base" and a "current" price in the market sense, so they are labelled by tier.
 * Prices are credits per smallest token unit: Platform charges
 * `price × token_count` with `token_count` in raw units.
 */
export function readTokenPrice(info: unknown): TokenPriceSummary | null {
  if (!info) return null;
  const base = readProp<string | bigint | number>(info, 'basePrice');
  const current = readProp<string | bigint | number>(info, 'currentPrice');
  if (base === undefined && current === undefined) return null;
  return { first: String(base ?? current), last: String(current ?? base) };
}

function credits(value: string) {
  return (
    <Tooltip label={`${formatCredits(value)} credits per smallest token unit`} hasArrow>
      <Text as="span" fontFamily="mono">{formatDashAmount(value, 8)} DASH</Text>
    </Tooltip>
  );
}

export function TokenPrice({ info }: { info: unknown }) {
  const price = readTokenPrice(info);
  if (!price) return <Text as="span" color="gray.400" fontSize="xs">not for sale</Text>;
  if (price.first === price.last) return <Text as="span" fontSize="xs" color="gray.100">{credits(price.first)}</Text>;
  return (
    <Text as="span" fontSize="xs" color="gray.100">
      {credits(price.first)} <Text as="span" color="gray.400">(smallest tier) …</Text> {credits(price.last)}{' '}
      <Text as="span" color="gray.400">(largest tier)</Text>
    </Text>
  );
}

export function TokenPausedBadge({ status, loading }: { status: unknown; loading?: boolean }) {
  if (loading) return <Text as="span" color="gray.500" fontSize="xs">…</Text>;
  const paused = readProp<boolean>(status, 'isPaused');
  if (paused === undefined) {
    return (
      <Tooltip label="No status record is stored; Platform treats a token without one as active. A record is written when a token starts paused or an emergency action pauses or resumes it." hasArrow>
        <Text as="span" color="green.300" fontSize="xs">active</Text>
      </Tooltip>
    );
  }
  return paused
    ? <Text as="span" color="red.300" fontSize="xs" fontWeight={600}>paused</Text>
    : <Text as="span" color="green.300" fontSize="xs">active</Text>;
}

