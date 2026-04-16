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

/** Coerce a value that may be a string, a base58 identifier object, or a
 *  wrapper with a custom `toString`, into a plain string. */
export function idToString(x: unknown): string | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') return x;
  if (typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  if (typeof o.toString === 'function' && o.toString !== Object.prototype.toString) {
    try {
      const s = (o.toString as () => unknown)();
      if (typeof s === 'string' && s !== '[object Object]') return s;
    } catch {
      /* noop */
    }
  }
  if (typeof o.base58 === 'string') return o.base58;
  return undefined;
}
