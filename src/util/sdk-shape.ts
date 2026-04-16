// Shared helpers for reading values off SDK return objects that may be either
// plain records or class instances with `getFoo()` accessors.

/** Read `key` from `obj`, falling back to `getKey()` if `key` is absent. */
export function readProp<T>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  const direct = rec[key];
  if (direct !== undefined) return direct as T;
  const getterName = `get${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
  const getter = rec[getterName];
  if (typeof getter === 'function') {
    try {
      return (getter as () => T).call(rec);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Standard Bitcoin/Dash base58 encoding of a byte array. Used to render
 *  32-byte platform Identifiers that arrive as raw Uint8Array (e.g. the
 *  `records.identity` field on DPNS documents, which is a binary identifier
 *  in the contract schema rather than an Identifier class instance). */
function bytesToBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i] ?? 0];
  return out;
}

/** Coerce a value that may be a string, a Uint8Array of bytes, a base58
 *  identifier class, or a wrapper with a custom `toString`, into a plain
 *  base58 string. */
export function idToString(x: unknown): string | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') return x;
  if (x instanceof Uint8Array) {
    // 32-byte Platform Identifier → base58 (43–44 chars).
    return bytesToBase58(x);
  }
  if (typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  // Identifier class exposes `toBase58()`, prefer it over generic toString().
  const toBase58 = o.toBase58;
  if (typeof toBase58 === 'function') {
    try {
      const s = (toBase58 as () => unknown).call(o);
      if (typeof s === 'string' && s.length > 0) return s;
    } catch {
      /* fall through */
    }
  }
  if (typeof o.toString === 'function' && o.toString !== Object.prototype.toString) {
    try {
      const s = (o.toString as () => unknown).call(o);
      if (
        typeof s === 'string' &&
        s !== '[object Object]' &&
        // Reject Uint8Array.toString() output (comma-separated numbers).
        !/^\d+(,\s*\d+)+$/.test(s)
      ) {
        return s;
      }
    } catch {
      /* noop */
    }
  }
  if (typeof o.base58 === 'string') return o.base58;
  return undefined;
}
