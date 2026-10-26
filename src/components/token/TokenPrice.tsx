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
 * `TokenPriceInfo` (rc.2 and 5.0) flattens the pricing schedule: a single price fills
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

/** Credits per smallest unit, shown as DASH per whole token when the token's
 *  decimals are known (sub-1000-credit unit prices would round to 0 DASH). */
function Price({ value, decimals }: { value: string; decimals?: number }) {
  const perUnit = `${formatCredits(value)} credits per smallest unit`;
  if (decimals === undefined) return <Text as="span" fontFamily="mono">{perUnit}</Text>;
  const perToken = (BigInt(value) * 10n ** BigInt(decimals)).toString();
  return (
    <Tooltip label={perUnit} hasArrow>
      <Text as="span" fontFamily="mono" tabIndex={0} aria-label={`${formatDashAmount(perToken, 8)} DASH per token (${perUnit})`}>
        {formatDashAmount(perToken, 8)} DASH / token
      </Text>
    </Tooltip>
  );
}

export function TokenPrice({ info, decimals }: { info: unknown; decimals?: number }) {
  const price = readTokenPrice(info);
  if (!price) return <Text as="span" color="gray.400" fontSize="xs">not for sale</Text>;
  if (price.first === price.last) {
    return <Text as="span" fontSize="xs" color="gray.100"><Price value={price.first} decimals={decimals} /></Text>;
  }
  return (
    <Text as="span" fontSize="xs" color="gray.100">
      <Price value={price.first} decimals={decimals} /> <Text as="span" color="gray.400">(smallest tier) …</Text>{' '}
      <Price value={price.last} decimals={decimals} /> <Text as="span" color="gray.400">(largest tier)</Text>
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

