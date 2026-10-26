/**
 * Parse a non-negative base-10 integer. `BigInt()` alone also accepts hex,
 * octal, and binary literals (`0x10`), which a credit amount must not.
 */
export function parseDecimalBigInt(text: string): bigint | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}
