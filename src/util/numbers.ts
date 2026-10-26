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

/** A non-negative integer from an SDK value (bigint, safe number, or digit string), else undefined. */
export function toUnsignedBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value >= 0n ? value : undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}
