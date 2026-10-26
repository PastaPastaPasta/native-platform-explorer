import { bytesToBase58 } from './sdk-shape';

// A proTxHash reaches the UI in two encodings: live epoch and protocol-vote
// queries key their maps by 64-char hex, while finalized epoch records key
// `blockProposers` by the base58 Identifier of the same 32 bytes. Lookups
// compare the canonical lowercase hex form.

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function base58ToBytes(input: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(input[i]!);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

/** Canonical lowercase hex for a proTxHash given as 64-char hex or as the
 *  base58 encoding of its 32 bytes. Returns null for anything else. */
export function proTxHashToHex(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (HEX64_RE.test(s)) return s.toLowerCase();
  if (!BASE58_RE.test(s)) return null;
  const bytes = base58ToBytes(s);
  if (!bytes || bytes.length !== 32) return null;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base58 form of a 64-char hex proTxHash (as finalized epochs key it). */
export function proTxHashToBase58(hex: string): string | null {
  if (!HEX64_RE.test(hex)) return null;
  const bytes = Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
  return bytesToBase58(bytes);
}

/** Re-key a proposer map (hex or base58 keys, bigint/number block counts) by
 *  canonical hex. Keys that are not proTxHashes are dropped. */
export function proposerMapByHex(m: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!(m instanceof Map)) return out;
  for (const [key, value] of m) {
    const hex = proTxHashToHex(typeof key === 'string' ? key : String(key ?? ''));
    if (!hex) continue;
    out.set(hex, (out.get(hex) ?? 0) + Number(value ?? 0));
  }
  return out;
}
