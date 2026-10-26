import { describe, expect, it } from 'vitest';
import { proposerMapByHex, proTxHashToBase58, proTxHashToHex } from '../protx';

// Live mainnet proTxHash (epoch 86 proposer) in both encodings.
const HEX = '001cb9381b08d784f4c1e1e220906874ea9e88f7124ebdf8baf0782007afad4f';

describe('proTxHash encodings', () => {
  it('canonicalises hex to lowercase', () => {
    expect(proTxHashToHex(HEX.toUpperCase())).toBe(HEX);
    expect(proTxHashToHex(`  ${HEX}  `)).toBe(HEX);
  });

  it('round-trips base58, keeping leading zero bytes', () => {
    const b58 = proTxHashToBase58(HEX)!;
    expect(b58.startsWith('1')).toBe(true);
    expect(proTxHashToHex(b58)).toBe(HEX);
    expect(proTxHashToHex('11111111111111111111111111111111')).toBe('00'.repeat(32));
    expect(proTxHashToBase58('00'.repeat(32))).toBe('11111111111111111111111111111111');
  });

  it('rejects values that are not 32-byte hashes', () => {
    expect(proTxHashToHex('')).toBeNull();
    expect(proTxHashToHex(undefined)).toBeNull();
    expect(proTxHashToHex(HEX.slice(2))).toBeNull();
    expect(proTxHashToHex('0OIl'.repeat(10))).toBeNull();
    // Valid base58 that decodes to fewer than 32 bytes.
    expect(proTxHashToHex('2'.repeat(32))).toBeNull();
    expect(proTxHashToBase58('xyz')).toBeNull();
  });

  it('re-keys finalized (base58) and live (hex) proposer maps alike', () => {
    const b58 = proTxHashToBase58(HEX)!;
    expect(proposerMapByHex(new Map([[b58, 5n]]))).toEqual(new Map([[HEX, 5]]));
    expect(proposerMapByHex(new Map([[HEX, 7n], ['junk', 1n]]))).toEqual(new Map([[HEX, 7]]));
    expect(proposerMapByHex(undefined)).toEqual(new Map());
  });
});
