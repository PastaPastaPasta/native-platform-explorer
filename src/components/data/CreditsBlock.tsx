'use client';

import { HStack, Text, VStack, Tooltip } from '@chakra-ui/react';
import BigNumber from 'bignumber.js';
import { creditsToDash, formatCredits } from '@util/credits';
import { currencyRound } from '@util/numbers';
import { useDashUsdRate } from '@sdk/queries';
import { NotActive } from './NotActive';

export interface CreditsBlockProps {
  credits: bigint | number | string | null | undefined;
  stacked?: boolean;
  showUsd?: boolean;
}

export function CreditsBlock({ credits, stacked = true, showUsd = true }: CreditsBlockProps) {
  const rateQ = useDashUsdRate();
  const rate = rateQ.data?.price;

  if (credits === null || credits === undefined) return <NotActive />;

  const dashStr = creditsToDash(credits);
  const usd =
    showUsd && rate !== undefined
      ? new BigNumber(dashStr).multipliedBy(rate).toNumber()
      : null;

  const Layout = stacked ? VStack : HStack;

  return (
    <Layout align={stacked ? 'flex-start' : 'center'} spacing={stacked ? 0 : 3}>
      <Tooltip label={`${formatCredits(credits)} credits`} hasArrow>
        <Text fontFamily="mono" fontSize="md" color="gray.100">
          {dashStr || '0'} <Text as="span" color="gray.400" fontSize="xs">DASH</Text>
        </Text>
      </Tooltip>
      {usd !== null ? (
        <Text fontFamily="mono" fontSize="xs" color="gray.400">
          ${currencyRound(usd)}
        </Text>
      ) : null}
    </Layout>
  );
}
