// Lightweight classifiers for strings the user might paste into the global search box.
// These are best-effort; we do not try to decode the payloads — we just shape-test.

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX_RE = /^[0-9a-fA-F]+$/;
const BECH32M_RE = /^[a-z]{1,83}1[02-9ac-hj-np-z]{6,}$/;
const DPNS_LABEL_RE = /^[a-zA-Z0-9-]{3,63}$/;

/** Platform Identifier: 32 bytes base58 → 43 or 44 chars. */
export function isBase58Identifier(input: string): boolean {
  const s = input.trim();
  return (s.length === 43 || s.length === 44) && BASE58_RE.test(s);
}

/** A 64-char hex string (e.g. tx hash or proTxHash). */
export function isHex64(input: string): boolean {
  const s = input.trim();
  return s.length === 64 && HEX_RE.test(s);
}

/** 40-char hex (PubKey hash). */
export function isPublicKeyHash(input: string): boolean {
  const s = input.trim();
  return s.length === 40 && HEX_RE.test(s);
}

/** Very permissive bech32m check. Real validation is done server-side. */
export function isBech32mAddress(input: string): boolean {
  return BECH32M_RE.test(input.trim().toLowerCase());
}

/** Matches either `label.dash` or a bare label (e.g. `alice`). */
export function looksLikeDpnsName(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (s.endsWith('.dash')) {
    const label = s.slice(0, -5);
    return DPNS_LABEL_RE.test(label);
  }
  return DPNS_LABEL_RE.test(s);
}

/** Small-integer shape, e.g. epoch index. */
export function looksLikeEpochIndex(input: string): boolean {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000;
}

/** Abbreviate a long identifier for display (head…tail). */
export function shortId(id: string, head = 6, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}
