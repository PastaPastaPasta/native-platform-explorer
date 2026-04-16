import { describe, expect, it } from 'vitest';
import { idToString, readDocumentField, readPath, readProp } from '../sdk-shape';

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
});

describe('readPath', () => {
  it('walks nested plain objects via dot-path', () => {
    const obj = { records: { identity: 'abc' } };
    expect(readPath(obj, 'records.identity')).toBe('abc');
  });

  it('walks through getXxx() accessors at each step', () => {
    const inner = { getIdentity: () => 'via-getter' };
    const outer = { getRecords: () => inner };
    expect(readPath(outer, 'records.identity')).toBe('via-getter');
  });

  it('returns undefined when any step is missing', () => {
    expect(readPath({ records: {} }, 'records.identity')).toBeUndefined();
    expect(readPath({}, 'records.identity')).toBeUndefined();
  });
});

describe('readDocumentField', () => {
  it('reads user-defined fields out of `properties`', () => {
    // Shape the SDK's Document class produces: system fields top-level,
    // user fields under `properties`.
    const doc = {
      id: 'sys-id',
      ownerId: 'sys-owner',
      properties: { label: 'Alice', normalizedLabel: 'alice' },
    };
    expect(readDocumentField(doc, 'label')).toBe('Alice');
    expect(readDocumentField(doc, 'normalizedLabel')).toBe('alice');
  });

  it('resolves nested user-field dot-paths like `records.identity`', () => {
    const doc = {
      id: 'sys-id',
      properties: { records: { identity: 'owner-b58' } },
    };
    expect(readDocumentField(doc, 'records.identity')).toBe('owner-b58');
  });

  it('reads `$id` / `$ownerId` off top-level (class exposes them as id/ownerId)', () => {
    const doc = { id: 'top-id', ownerId: 'top-owner', properties: {} };
    expect(readDocumentField(doc, '$id')).toBe('top-id');
    expect(readDocumentField(doc, '$ownerId')).toBe('top-owner');
  });

  it('falls back to top-level for plain-object rows without a `properties` bag', () => {
    const row = { label: 'plain' };
    expect(readDocumentField(row, 'label')).toBe('plain');
  });

  it('prefers the `properties` bag over a shadowed top-level key', () => {
    // Top-level `label` may be a stale/unrelated field; the schema-declared
    // property inside `properties` is the authoritative value.
    const doc = { label: 'top', properties: { label: 'real' } };
    expect(readDocumentField(doc, 'label')).toBe('real');
  });

  it('returns undefined for nullish input', () => {
    expect(readDocumentField(null, 'label')).toBeUndefined();
    expect(readDocumentField(undefined, 'label')).toBeUndefined();
  });
});
