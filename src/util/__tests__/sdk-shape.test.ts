import { describe, expect, it } from 'vitest';
import { idToString, readProp } from '../sdk-shape';

describe('idToString', () => {
  it('passes strings through', () => {
    expect(idToString('GWRSA…')).toBe('GWRSA…');
  });

  it('encodes Uint8Array as base58 instead of comma-separated bytes', () => {
    // Known 32-byte identifier → base58 (Bitcoin alphabet). We don't assert
    // the exact base58 output here; just that it's not the default
    // `Uint8Array.toString()` comma-separated form, and that it round-trips
    // to the expected length for a 32-byte id.
    const bytes = new Uint8Array([
      240, 92, 49, 154, 154, 144, 162, 243, 36, 223, 199, 33, 202, 43, 93, 73,
      92, 174, 18, 226, 5, 100, 3, 39, 130, 22, 208, 56, 216, 118, 213, 136,
    ]);
    const out = idToString(bytes);
    expect(typeof out).toBe('string');
    expect(out).not.toContain(','); // must not fall through to Uint8Array.toString
    expect(out!.length).toBeGreaterThanOrEqual(42);
    expect(out!.length).toBeLessThanOrEqual(44);
  });

  it('handles a class exposing toBase58()', () => {
    const mock = { toBase58: () => 'MockB58Output' };
    expect(idToString(mock)).toBe('MockB58Output');
  });

  it('rejects comma-separated Uint8Array-like toString output', () => {
    // If somehow a non-Uint8Array object yields comma-separated digits via
    // its toString, we still reject — users should never see that.
    const mock = { toString: () => '240,92,49,154' };
    expect(idToString(mock)).toBeUndefined();
  });

  it('returns undefined for nullish input', () => {
    expect(idToString(null)).toBeUndefined();
    expect(idToString(undefined)).toBeUndefined();
  });
});

describe('readProp', () => {
  it('reads a direct own property', () => {
    expect(readProp({ foo: 42 }, 'foo')).toBe(42);
  });

  it('falls back to a getXxx() method', () => {
    const obj = { getFoo: () => 'via-getter' };
    expect(readProp(obj, 'foo')).toBe('via-getter');
  });

  it('returns undefined for nullish', () => {
    expect(readProp(null, 'anything')).toBeUndefined();
    expect(readProp(undefined, 'anything')).toBeUndefined();
  });

  it('falls through to `properties` for SDK Document schema fields', () => {
    // Shape of an @dashevo/evo-sdk Document: system fields (`id`, `ownerId`)
    // are instance getters, schema-declared fields live inside `properties`.
    const doc = {
      get id() {
        return 'doc-id';
      },
      properties: { label: 'alice', normalizedLabel: 'a11ce' },
    };
    expect(readProp(doc, 'label')).toBe('alice');
    expect(readProp(doc, 'normalizedLabel')).toBe('a11ce');
    // System field must still resolve via the top-level getter, not `properties`.
    expect(readProp(doc, 'id')).toBe('doc-id');
  });

  it('also checks a `data` wrapper (alias for `properties`)', () => {
    const doc = { data: { label: 'bob' } };
    expect(readProp(doc, 'label')).toBe('bob');
  });

  it('prefers a top-level getter over a matching `properties` entry', () => {
    // Guards against system fields being shadowed when schema happens to use
    // the same name (e.g. a hypothetical user-defined `createdAt`).
    const doc = {
      get createdAt() {
        return 1000;
      },
      properties: { createdAt: 9999 },
    };
    expect(readProp(doc, 'createdAt')).toBe(1000);
  });

  it('resolves dotted paths across the properties wrapper', () => {
    // DPNS `domain` schema: `records.identity` is an index key; the `records`
    // object lives under `.properties`, and `identity` is a nested field on it.
    const doc = {
      properties: {
        records: { identity: 'nested-id' },
      },
    };
    expect(readProp(doc, 'records.identity')).toBe('nested-id');
  });

  it('returns undefined for a partial dotted path', () => {
    expect(readProp({ properties: {} }, 'records.identity')).toBeUndefined();
    expect(readProp({ properties: { records: 'not-an-object' } }, 'records.identity')).toBeUndefined();
  });

  it('does not recurse into `properties` when asked for `properties` itself', () => {
    const doc = { properties: { foo: 1, bar: 2 } };
    expect(readProp(doc, 'properties')).toEqual({ foo: 1, bar: 2 });
  });
});
