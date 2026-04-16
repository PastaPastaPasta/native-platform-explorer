import { describe, expect, it } from 'vitest';
import { convertToHomographSafeChars, normaliseDpnsName, validateLabel } from '../dpns';

describe('convertToHomographSafeChars', () => {
  it('maps o, O, i, I, l, L to 0/1', () => {
    expect(convertToHomographSafeChars('ollie')).toBe('0111e');
  });

  it('is idempotent on already-safe strings', () => {
    expect(convertToHomographSafeChars('alice123')).toBe('a11ce123');
  });
});

describe('normaliseDpnsName', () => {
  it('adds .dash if absent', () => {
    expect(normaliseDpnsName('alice')).toBe('alice.dash');
  });

  it('keeps .dash if present and lowercases', () => {
    expect(normaliseDpnsName('Alice.Dash')).toBe('alice.dash');
  });
});

describe('validateLabel', () => {
  it('accepts a normal label', () => {
    expect(validateLabel('alice').valid).toBe(true);
  });

  it('rejects leading dash', () => {
    expect(validateLabel('-alice').valid).toBe(false);
  });

  it('rejects too-short labels', () => {
    expect(validateLabel('ab').valid).toBe(false);
  });
});
