import BigNumber from 'bignumber.js';

export function numberFormat(
  value: number | string | bigint | BigNumber,
  decimals = 0,
): string {
  const bn = new BigNumber(typeof value === 'bigint' ? value.toString() : value);
  if (bn.isNaN()) return '—';
  return bn.toFormat(decimals);
}

export function currencyRound(value: number | string | bigint, decimals = 2): string {
  const bn = new BigNumber(typeof value === 'bigint' ? value.toString() : value);
  if (bn.isNaN()) return '—';
  return bn.toFormat(decimals);
}

export function removeTrailingZeros(input: string): string {
  if (!input.includes('.')) return input;
  return input.replace(/0+$/, '').replace(/\.$/, '');
}
