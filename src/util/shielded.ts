// Helpers for the shielded (Orchard) pool page.

/**
 * Encrypted notes can only be fetched from a window boundary. Drive requires
 * `startIndex` to be a multiple of its 2048-note MMR chunk, and the SDK's proof
 * verifier requires a multiple of its per-query cap, `max_query_chunks × 2048`
 * (4 × 2048 at the protocol versions rc.2 verifies against). Live, a start of
 * 2048 or 4096 is rejected and 0 / 8192 succeed.
 */
export const SHIELDED_NOTES_WINDOW = 8192;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parse one 32-byte nullifier, as 64 hex characters or standard base64. */
export function parseNullifier(input: string): { hex: string } | { error: string } {
  const text = input.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(text)) return { hex: text.replace(/^0x/, '').toLowerCase() };
  if (/^[A-Za-z0-9+/]{43}=$/.test(text)) {
    try {
      const binary = atob(text);
      if (binary.length === 32) {
        return { hex: bytesToHex(Uint8Array.from(binary, (c) => c.charCodeAt(0))) };
      }
    } catch {
      /* fall through */
    }
  }
  return { error: `"${text.length > 20 ? `${text.slice(0, 20)}…` : text}" is not a 32-byte nullifier (64 hex characters or base64).` };
}

/** Split a pasted list (newlines, commas or spaces) into parsed nullifiers. */
export function parseNullifierList(input: string): { hexes: string[]; errors: string[] } {
  const hexes: string[] = [];
  const errors: string[] = [];
  for (const part of input.split(/[\s,]+/).filter(Boolean)) {
    const parsed = parseNullifier(part);
    if ('hex' in parsed) {
      if (!hexes.includes(parsed.hex)) hexes.push(parsed.hex);
    } else errors.push(parsed.error);
  }
  return { hexes, errors };
}
