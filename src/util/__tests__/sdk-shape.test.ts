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
});
