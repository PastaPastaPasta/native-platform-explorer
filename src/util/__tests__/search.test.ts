import { describe, expect, it } from 'vitest';
import { classifyQuery } from '../search';

describe('classifyQuery', () => {
  it('returns no candidates for empty input', () => {
    expect(classifyQuery('  ').candidates).toEqual([]);
  });

  it('recognises epoch indices', () => {
    expect(classifyQuery('42').candidates).toContainEqual({ kind: 'epoch', index: 42 });
  });

  it('classifies a 43-char base58 string as identity/contract/token', () => {
    const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
    expect(id.length).toBe(44);
    const kinds = classifyQuery(id).candidates.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['identity', 'contract', 'token']));
  });

  it('recognises a 64-char hex string as state transition / evonode', () => {
    const hex = 'a'.repeat(64);
    const kinds = classifyQuery(hex).candidates.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['stateTransition', 'evonode']));
  });

  it('recognises a 40-char hex as public-key hash', () => {
    const kinds = classifyQuery('f'.repeat(40)).candidates.map((c) => c.kind);
    expect(kinds).toContain('identityByPkh');
  });

  it('recognises a DPNS name with .dash suffix', () => {
    const candidates = classifyQuery('alice.dash').candidates;
    expect(candidates).toContainEqual({ kind: 'dpnsName', name: 'alice.dash' });
  });

  it('recognises a bare label as both DPNS name and prefix', () => {
    const candidates = classifyQuery('alice').candidates;
    expect(candidates).toContainEqual({ kind: 'dpnsName', name: 'alice.dash' });
    expect(candidates).toContainEqual({ kind: 'dpnsPrefix', prefix: 'alice' });
  });
});
