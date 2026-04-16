// Shared helpers for reading values off SDK return objects that may be either
// plain records or class instances with `getFoo()` accessors.

/** Read `key` from `obj`, falling back to:
 *   1. a `getKey()` method (WASM/Java-style accessor), then
 *   2. `obj.properties[key]` / `obj.data[key]` — on the SDK `Document` class,
 *      schema-declared fields (e.g. DPNS `label`, `normalizedLabel`) live under
 *      the `properties` object, not as top-level getters. The system fields
 *      (`id`, `ownerId`, `createdAt`, …) are getters directly on the instance.
 *
 *  Supports dotted paths (`records.identity`) by splitting on `.` and reading
 *  segment-by-segment — needed because platform index keys on nested schema
 *  fields use dotted notation. */
export function readProp<T>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const dot = key.indexOf('.');
  if (dot >= 0) {
    const head = key.slice(0, dot);
    const tail = key.slice(dot + 1);
    return readProp<T>(readProp<unknown>(obj, head), tail);
  }
  const rec = obj as Record<string, unknown>;
  // `key in rec` picks up accessors on the prototype (WASM classes expose
  // `id`/`ownerId` as getters), so we stop here even if the getter legitimately
  // returns `undefined`. That prevents a system getter from being shadowed by
  // a same-named schema field nested under `properties`.
  if (key in rec) return rec[key] as T;
  const getterName = `get${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
  if (getterName in rec && typeof rec[getterName] === 'function') {
    try {
      return (rec[getterName] as () => T).call(rec);
    } catch {
      return undefined;
    }
  }
  // Unwrap the SDK `Document.properties` / `.data` containers only when the
  // key isn't satisfied higher up. Never recurse into these for the literal
  // keys `properties`/`data` themselves, otherwise callers asking for the
  // container would get its first child.
  if (key !== 'properties' && key !== 'data') {
    for (const wrapper of ['properties', 'data'] as const) {
      const inner = rec[wrapper];
      if (inner && typeof inner === 'object' && key in (inner as Record<string, unknown>)) {
        return (inner as Record<string, unknown>)[key] as T;
      }
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
