'use client';

import { Badge, HStack, Text, VStack, Tooltip } from '@chakra-ui/react';
import BigNumber from 'bignumber.js';
import { creditsToDash, formatCredits } from '@util/credits';
import { currencyRound } from '@util/numbers';
import { useDashUsdRate } from '@sdk/queries';
import { NotActive } from './NotActive';

export interface CreditsBlockProps {
  credits: bigint | number | string | null | undefined;
  /** 'stacked' = DASH on top of USD (default, matches Stage 2 call sites).
   *  'inline' = credits + DASH + USD on one line — hero digest style.
   *  'compact' = single row of DASH + USD, right-align friendly. */
  layout?: 'stacked' | 'inline' | 'compact';
  showUsd?: boolean;
}

export function CreditsBlock({
  credits,
  layout = 'stacked',
  showUsd = true,
}: CreditsBlockProps) {
  const rateQ = useDashUsdRate();
  const rate = rateQ.data?.price;

  if (credits === null || credits === undefined) return <NotActive />;

  const dashStr = creditsToDash(credits);
  const creditsStr = formatCredits(credits);
  const usd =
    showUsd && rate !== undefined
      ? new BigNumber(dashStr).multipliedBy(rate).toNumber()
      : null;

  if (layout === 'inline') {
    return (
      <HStack spacing={2} align="center" flexWrap="wrap" justify="flex-end">
        <Text fontFamily="mono" fontSize="sm" color="gray.100">
          {creditsStr}{' '}
          <Text as="span" color="gray.400" fontSize="xs">
            CREDITS
          </Text>
        </Text>
        <Text fontFamily="mono" fontSize="xs" color="gray.400">
          ({dashStr || '0'} DASH)
        </Text>
        {usd !== null ? (
          <Badge
            bg="gray.750"
            color="gray.250"
            fontFamily="mono"
            textTransform="none"
            fontSize="2xs"
            px={2}
            py={0.5}
            borderRadius="full"
          >
            ~${currencyRound(usd)}
          </Badge>
        ) : null}
      </HStack>
    );
  }

  if (layout === 'compact') {
    return (
      <Tooltip label={`${creditsStr} credits`} hasArrow>
        <HStack spacing={2} align="center">
          <Text fontFamily="mono" fontSize="sm" color="gray.100">
            {dashStr || '0'}{' '}
            <Text as="span" color="gray.400" fontSize="xs">
              DASH
            </Text>
          </Text>
          {usd !== null ? (
            <Text fontFamily="mono" fontSize="xs" color="gray.400">
              ~${currencyRound(usd)}
            </Text>
          ) : null}
        </HStack>
      </Tooltip>
    );
  }

  return (
    <VStack align="flex-start" spacing={0}>
      <Tooltip label={`${creditsStr} credits`} hasArrow>
        <Text fontFamily="mono" fontSize="md" color="gray.100">
          {dashStr || '0'}{' '}
          <Text as="span" color="gray.400" fontSize="xs">
            DASH
          </Text>
        </Text>
      </Tooltip>
      {usd !== null ? (
        <Text fontFamily="mono" fontSize="xs" color="gray.400">
          ${currencyRound(usd)}
        </Text>
      ) : null}
    </VStack>
  );
}
