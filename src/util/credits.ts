import BigNumber from 'bignumber.js';

// PRD §5: 1 DASH = 1e11 credits.
export const CREDITS_PER_DASH = new BigNumber(1e11);

export function creditsToDash(credits: bigint | number | string): string {
  const bn = new BigNumber(typeof credits === 'bigint' ? credits.toString() : credits);
  return bn.dividedBy(CREDITS_PER_DASH).toFixed(11).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatCredits(credits: bigint | number | string): string {
  const bn = new BigNumber(typeof credits === 'bigint' ? credits.toString() : credits);
  return bn.toFormat(0);
}

export function formatNumber(value: number | string, decimals = 2): string {
  return new BigNumber(value).toFormat(decimals);
}
