import { describe, expect, it } from 'vitest';
import { convertToHomographSafeChars, dpnsDomainRows, dpnsPrefixMatches, normaliseDpnsName, validateLabel } from '../dpns';

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
      { docId: 'a', fqdn: 'Alice.dash', normalizedLabel: 'a11ce', normalizedFqdn: 'a11ce.dash', ownerId: owner },
      { docId: 'b', fqdn: 'b0b.dash', normalizedLabel: 'b0b', normalizedFqdn: 'b0b.dash', ownerId: owner },
    ]);
    expect(dpnsDomainRows(undefined)).toEqual([]);
  });

  it('folds homographs when a document has no normalizedLabel', () => {
    const [row] = dpnsDomainRows([{ id: 'x', properties: { label: 'Oli' } }]);
    expect(row).toMatchObject({ normalizedLabel: '011', normalizedFqdn: '011.dash' });
  });
});

describe('dpnsPrefixMatches', () => {
  const rows = dpnsDomainRows([
    { id: '1', properties: { label: 'Alice', normalizedLabel: 'a11ce' } },
    { id: '2', properties: { label: 'airjordan', normalizedLabel: 'a1rj0rdan' } },
    { id: '3', properties: { label: '0-0', normalizedLabel: '0-0' } },
  ]);

  it('keeps names whose homograph-safe label starts with the normalized prefix', () => {
    const { rows: kept, outside } = dpnsPrefixMatches(rows, convertToHomographSafeChars('al'));
    expect(kept.map((r) => r.fqdn)).toEqual(['Alice.dash', 'airjordan.dash']);
    expect(outside).toBe(1);
  });

  it('reports nothing outside when every row matches', () => {
    expect(dpnsPrefixMatches(rows.slice(0, 2), 'a1').outside).toBe(0);
  });
});
