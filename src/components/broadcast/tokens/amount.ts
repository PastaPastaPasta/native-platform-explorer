import { formatTokenAmount } from '@util/token-rules';

/**
 * Platform accepts token amounts of 1 to 2^48 − 1 base units (rs-dpp
 * `MAX_DISTRIBUTION_PARAM`, checked by every token transition's structure
 * validation).
 */
export const MAX_TOKEN_AMOUNT = 281_474_976_710_655n;
/** Supplies are summed in i64 trees, so a max supply cannot exceed i64::MAX. */
export const MAX_TOKEN_SUPPLY = 9_223_372_036_854_775_807n;
/** rs-dpp `MAX_TOKEN_NOTE_LEN`, in UTF-8 bytes. */
export const MAX_PUBLIC_NOTE_BYTES = 2048;
/** Larger values cannot be stored by a token's conventions. */
const MAX_DECIMALS = 16;

export type ParsedAmount = { value: bigint; error?: undefined } | { value?: undefined; error: string };

/**
 * Convert a display amount ("1.5") to integer base units with exact decimal
 * arithmetic. Fractions beyond the token's decimals are rejected, never rounded.
 */
export function parseTokenAmount(text: string, decimals: number, max = MAX_TOKEN_AMOUNT): ParsedAmount {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS)
    return { error: `Unsupported token decimals ${decimals}.` };
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed))
    return { error: 'Enter a positive decimal number, for example 1.5.' };
  const [whole, fraction = ''] = trimmed.split('.') as [string, string?];
  if (fraction.length > decimals)
    return {
      error:
        decimals === 0
          ? 'This token has no decimal places.'
          : `This token has ${decimals} decimal places; use at most ${decimals} digits after the point.`,
    };
  const scale = 10n ** BigInt(decimals);
  const value = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (value === 0n) return { error: 'The amount must be greater than zero.' };
  if (value > max)
    return { error: `Platform accepts at most ${formatTokenAmount(max, decimals)} (${max} base units).` };
  return { value };
}

/** "1.5 TOK (150000000 base units)": the exact amount the review step states. */
export function describeTokenAmount(value: bigint, decimals: number, name: string): string {
  const units = value === 1n ? 'base unit' : 'base units';
  return `${formatTokenAmount(value, decimals)} ${name} (${value} ${units})`;
}

export function publicNoteError(note: string | undefined): string | null {
  if (!note) return null;
  const bytes = new TextEncoder().encode(note).length;
  return bytes > MAX_PUBLIC_NOTE_BYTES
    ? `The public note is ${bytes} bytes; Platform accepts at most ${MAX_PUBLIC_NOTE_BYTES}.`
    : null;
}
