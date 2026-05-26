import { describe, expect, it } from 'vitest';
import { shouldUseProofTransport } from '../queries';

describe('shouldUseProofTransport', () => {
  it('uses proof transport for trusted built-in networks', () => {
    expect(shouldUseProofTransport('testnet', true, true)).toBe(true);
    expect(shouldUseProofTransport('mainnet', true, true)).toBe(true);
  });

  it('skips proof transport for untrusted built-in networks', () => {
    expect(shouldUseProofTransport('testnet', false, true)).toBe(false);
  });

  it('uses proof transport for devnets even though results are unverified', () => {
    expect(shouldUseProofTransport('devnet-paloma', false, true)).toBe(true);
    expect(shouldUseProofTransport('devnet-paloma', true, true)).toBe(true);
  });

  it('requires a proof-returning SDK method', () => {
    expect(shouldUseProofTransport('devnet-paloma', false, false)).toBe(false);
    expect(shouldUseProofTransport('testnet', true, false)).toBe(false);
  });
});
