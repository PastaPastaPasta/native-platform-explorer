import { describe, expect, it } from 'vitest';
import { decodeBech32m, platformAddressError } from '../platform-address';

// Generated with the pinned SDK: PlatformAddress.fromP2pkhHash(20 × 0x07) and
// PlatformAddress.fromP2shHash(20 × 0x09).
const TESTNET_P2PKH = 'tdash1kqrswpc8qurswpc8qurswpc8qurswpc8qu8dr2j6';
const MAINNET_P2PKH = 'dash1kqrswpc8qurswpc8qurswpc8qurswpc8quh2s5r5';
const TESTNET_P2SH = 'tdash1sqysjzgfpyysjzgfpyysjzgfpyysjzgfpym8m36j';

describe('Platform address validation', () => {
  it('decodes SDK-generated addresses to 21 bytes', () => {
    const decoded = decodeBech32m(TESTNET_P2PKH);
    expect(decoded?.hrp).toBe('tdash');
    expect(decoded?.bytes).toHaveLength(21);
    expect([...decoded!.bytes.slice(1)]).toEqual(Array(20).fill(7));
    expect(decodeBech32m(TESTNET_P2SH)?.bytes).toHaveLength(21);
  });

  it('accepts an address for the selected network', () => {
    expect(platformAddressError(TESTNET_P2PKH, 'testnet')).toBeNull();
    expect(platformAddressError(MAINNET_P2PKH, 'mainnet')).toBeNull();
    expect(platformAddressError(TESTNET_P2PKH.toUpperCase(), 'testnet')).toBeNull();
  });

  it('explains a network mismatch', () => {
    expect(platformAddressError(MAINNET_P2PKH, 'testnet')).toMatch(/mainnet/);
    expect(platformAddressError(TESTNET_P2PKH, 'mainnet')).toMatch(/dash1/);
  });

  it('rejects checksum errors, mixed case and other formats', () => {
    const typo = `${TESTNET_P2PKH.slice(0, -1)}q`;
    expect(platformAddressError(typo, 'testnet')).toMatch(/bech32m/);
    expect(platformAddressError('tDash1kqrswpc8qurswpc8qurswpc8qurswpc8qu8dr2j6', 'testnet')).toMatch(/bech32m/);
    expect(platformAddressError('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', 'testnet')).toMatch(/bech32m/);
    expect(platformAddressError('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'testnet')).toMatch(/bech32m/);
  });
});
