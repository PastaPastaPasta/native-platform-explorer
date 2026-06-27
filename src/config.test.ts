import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig } from './config';

const ENV_KEYS = [
  'NEXT_PUBLIC_DEFAULT_NETWORK',
  'NEXT_PUBLIC_TRUSTED_MODE',
  'NEXT_PUBLIC_DISABLE_WRITE_MODE',
  'NEXT_PUBLIC_RATE_PROVIDER',
  'NEXT_PUBLIC_WELL_KNOWN_URL',
] as const;

describe('getConfig', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) vi.stubEnv(key, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses deterministic defaults when env is absent', () => {
    expect(getConfig()).toMatchObject({
      defaultNetwork: 'testnet',
      trustedMode: true,
      disableWriteMode: false,
      rateProvider: 'kucoin',
      wellKnownUrl: null,
    });
  });

  it('parses public runtime toggles without rejecting custom devnets', () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'devnet-paloma');
    vi.stubEnv('NEXT_PUBLIC_TRUSTED_MODE', 'false');
    vi.stubEnv('NEXT_PUBLIC_DISABLE_WRITE_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_RATE_PROVIDER', 'coinbase');
    vi.stubEnv('NEXT_PUBLIC_WELL_KNOWN_URL', 'https://example.test/well-known.json');

    expect(getConfig()).toEqual({
      defaultNetwork: 'devnet-paloma',
      trustedMode: false,
      disableWriteMode: true,
      rateProvider: 'coinbase',
      wellKnownUrl: 'https://example.test/well-known.json',
    });
  });

  it('falls back to kucoin for unknown rate providers', () => {
    vi.stubEnv('NEXT_PUBLIC_RATE_PROVIDER', 'not-a-provider');
    expect(getConfig().rateProvider).toBe('kucoin');
  });
});
