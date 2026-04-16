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

/** Walk a dot-separated path through `obj`, using `readProp` at each step so
 *  WASM class instances (whose values are exposed via `getFoo()` accessors)
 *  traverse the same way as plain objects. Supports keys like
 *  `records.identity` on a DPNS domain document. */
export function readPath<T>(obj: unknown, path: string): T | undefined {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = readProp(cur, part);
  }
  return cur as T | undefined;
}

/** Read a field off an SDK `Document` row.
 *
 *  The SDK returns Document class instances rather than plain objects. System
 *  fields (`$id`, `$ownerId`, `id`, `ownerId`, `revision`, `createdAt`, …)
 *  live at the top level via getters. User-defined schema fields do NOT —
 *  they live inside a `properties: Record<string, unknown>` bag on the
 *  instance. Reading only the top level (as the schema-derived column key
 *  suggests) therefore misses every user field and renders blank cells.
 *
 *  This helper looks inside `properties` first for user fields, falls back
 *  to the top-level for system fields, and resolves dot-paths so nested
 *  values like `records.identity` work uniformly. */
export function readDocumentField<T>(row: unknown, key: string): T | undefined {
  if (!row || typeof row !== 'object') return undefined;
  // `$id` / `$ownerId` are the serialised spellings; the class exposes them
  // without the `$` prefix. Prefer the prefixed form if present.
  if (key === '$id' || key === '$ownerId') {
    return readProp<T>(row, key) ?? readProp<T>(row, key.slice(1));
  }
  const props = readProp<Record<string, unknown>>(row, 'properties');
  const fromProps = readPath<T>(props, key);
  if (fromProps !== undefined) return fromProps;
  // Fall back to top-level — covers plain-object rows and system fields
  // (`revision`, `createdAt`, …) accessed by their non-`$` name.
  return readPath<T>(row, key);
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
