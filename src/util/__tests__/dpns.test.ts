import { describe, expect, it } from 'vitest';
import { convertToHomographSafeChars, dpnsDomainRows, normaliseDpnsName, validateLabel } from '../dpns';

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

describe('dpnsDomainRows', () => {
  const owner = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
  it('reads label, normalized name, owner and cursor from domain documents', () => {
    const rows = dpnsDomainRows(new Map<string, unknown>([
      ['a', { id: 'a', properties: { label: 'Alice', normalizedLabel: 'a11ce', records: { identity: owner } } }],
      ['b', { $id: 'b', ownerId: owner, properties: { normalizedLabel: 'b0b' } }],
      ['c', { id: 'c', properties: {} }],
      ['d', null],
    ]));
    expect(rows).toEqual([
      { docId: 'a', fqdn: 'Alice.dash', normalizedFqdn: 'a11ce.dash', ownerId: owner },
      { docId: 'b', fqdn: 'b0b.dash', normalizedFqdn: 'b0b.dash', ownerId: owner },
    ]);
    expect(dpnsDomainRows(undefined)).toEqual([]);
  });
});
