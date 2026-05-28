import { describe, expect, it } from 'vitest';
import { shouldUseProofTransport } from '../queries';

describe('shouldUseProofTransport', () => {
  it('uses proof transport when trusted mode is on (and the SDK method has a proof variant)', () => {
    expect(shouldUseProofTransport('testnet', true, true)).toBe(true);
    expect(shouldUseProofTransport('mainnet', true, true)).toBe(true);
    // Devnets used to be force-routed through the proof variant regardless of
    // the trusted flag; with EvoSDK.devnetTrusted available in dev.7 they
    // follow the same rule as everything else.
    expect(shouldUseProofTransport('devnet-paloma', true, true)).toBe(true);
  });

  it('skips proof transport when trusted mode is off', () => {
    expect(shouldUseProofTransport('testnet', false, true)).toBe(false);
    expect(shouldUseProofTransport('devnet-paloma', false, true)).toBe(false);
  });

  it('requires a proof-returning SDK method even when trusted', () => {
    expect(shouldUseProofTransport('devnet-paloma', true, false)).toBe(false);
    expect(shouldUseProofTransport('testnet', true, false)).toBe(false);
  });
});
