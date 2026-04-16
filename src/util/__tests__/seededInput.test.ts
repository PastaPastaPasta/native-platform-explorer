import { describe, expect, it } from 'vitest';
import { parseSeededInput } from '../seededInput';

describe('parseSeededInput', () => {
  it('returns an empty list for blank input', () => {
    expect(parseSeededInput('   \n  \n')).toEqual([]);
  });

  it('classifies a base58 identifier', () => {
    const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
    const parsed = parseSeededInput(id);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ kind: 'identifier', value: id });
  });

  it('classifies a DPNS name and normalises it', () => {
    const parsed = parseSeededInput('alice');
    expect(parsed[0]).toMatchObject({ kind: 'dpns', value: 'alice.dash' });
  });

  it('flags invalid lines', () => {
    const parsed = parseSeededInput('!!! invalid');
    expect(parsed[0]?.kind).toBe('invalid');
  });

  it('dedupes and handles both commas and newlines', () => {
    const parsed = parseSeededInput('alice\n,alice,bob\nbob');
    expect(parsed.map((p) => p.value)).toEqual(['alice.dash', 'bob.dash']);
  });
});
