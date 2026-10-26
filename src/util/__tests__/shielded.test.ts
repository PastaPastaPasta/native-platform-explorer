import { describe, expect, it } from 'vitest';
import { parseNullifier, parseNullifierList } from '../shielded';

const hex = 'f49bc3c142cac390e7ae0c2a54ceb8a8b13750d49289c88bb4611c8b8a65c00b';
// The same 32 bytes as the base64 the rc.2 `ShieldedEncryptedNote.toJSON()` emits.
const base64 = '9JvDwULKw5DnrgwqVM64qLE3UNSSiciLtGEci4plwAs=';

describe('shielded helpers', () => {
  it('parses hex (optionally 0x-prefixed, any case) and base64 nullifiers', () => {
    expect(parseNullifier(hex)).toEqual({ hex });
    expect(parseNullifier(`0x${hex.toUpperCase()}`)).toEqual({ hex });
    expect(parseNullifier(base64)).toEqual({ hex });
    expect(parseNullifier('abc')).toHaveProperty('error');
    expect(parseNullifier(hex.slice(2))).toHaveProperty('error');
  });

  it('splits and de-duplicates a pasted list', () => {
    expect(parseNullifierList(`${hex}\n${base64}, nope`)).toEqual({
      hexes: [hex],
      errors: ['"nope" is not a 32-byte nullifier (64 hex characters or base64).'],
    });
  });
});
