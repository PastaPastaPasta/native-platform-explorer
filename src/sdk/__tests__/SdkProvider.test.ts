import { describe, expect, it } from 'vitest';
import { getDevnetSdkOptions, getEffectiveTrusted } from '../SdkProvider';

describe('getEffectiveTrusted', () => {
  it('preserves trusted mode for built-in proof-capable networks', () => {
    expect(getEffectiveTrusted('testnet', true)).toBe(true);
    expect(getEffectiveTrusted('testnet', false)).toBe(false);
    expect(getEffectiveTrusted('mainnet', true)).toBe(true);
  });

  it('disables trusted mode for devnets', () => {
    expect(getEffectiveTrusted('devnet-tadi', true)).toBe(false);
    expect(getEffectiveTrusted('devnet-tadi', false)).toBe(false);
  });
});

describe('getDevnetSdkOptions', () => {
  it('keeps devnet DAPI addresses while disabling trusted context replacement', () => {
    expect(getDevnetSdkOptions('devnet-tadi')).toMatchObject({
      addresses: expect.arrayContaining(['https://35.89.28.18:1443']),
      network: 'testnet',
      trusted: false,
    });
  });
});
