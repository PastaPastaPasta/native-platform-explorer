import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIDGE_URL, getBridgeUrl } from '../bridge';

describe('external bridge handoff', () => {
  it('uses the selected deployment with the exact supported network only', () => {
    expect(getBridgeUrl('mainnet', DEFAULT_BRIDGE_URL)).toBe(
      'https://bridge.dashhq.org/?network=mainnet',
    );
    expect(getBridgeUrl('testnet', DEFAULT_BRIDGE_URL)).toBe(
      'https://bridge.dashhq.org/?network=testnet',
    );
  });

  it('preserves an explicit HTTPS deployment subpath', () => {
    expect(getBridgeUrl('testnet', 'https://example.com/bridge///')).toBe(
      'https://example.com/bridge/?network=testnet',
    );
  });

  it.each(['devnet-tadi', 'devnet-custom', 'mainnet&identityId=secret', ''])(
    'does not let unsupported network %s fall back to Testnet in the bridge',
    (network) => expect(getBridgeUrl(network, DEFAULT_BRIDGE_URL)).toBeNull(),
  );

  it.each([
    '',
    ' ',
    'bridge.dashhq.org',
    'javascript:alert(1)',
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/?mode=topup',
    'https://example.com/#identity',
  ])('keeps a disabled or invalid override %s unavailable', (url) => {
    expect(getBridgeUrl('testnet', url)).toBeNull();
  });
});
