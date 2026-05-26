import { describe, expect, it } from 'vitest';
import { getDevnetSdkOptions, getEffectiveTrusted } from '../SdkProvider';

describe('getEffectiveTrusted', () => {
  it('preserves trusted mode for built-in proof-capable networks', () => {
    expect(getEffectiveTrusted('testnet', true)).toBe(true);
    expect(getEffectiveTrusted('testnet', false)).toBe(false);
    expect(getEffectiveTrusted('mainnet', true)).toBe(true);
  });

  it('disables trusted mode for devnets', () => {
    expect(getEffectiveTrusted('devnet-paloma', true)).toBe(false);
    expect(getEffectiveTrusted('devnet-paloma', false)).toBe(false);
  });
});

describe('getDevnetSdkOptions', () => {
  it('keeps devnet DAPI addresses while disabling trusted context replacement', () => {
    expect(getDevnetSdkOptions('devnet-paloma')).toMatchObject({
      addresses: expect.arrayContaining(['https://68.67.122.198:1443']),
      network: 'testnet',
      trusted: false,
    });
  });
});
