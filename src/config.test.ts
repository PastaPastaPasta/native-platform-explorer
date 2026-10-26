import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig } from './config';

const ENV_KEYS = [
  'NEXT_PUBLIC_DEFAULT_NETWORK',
  'NEXT_PUBLIC_TRUSTED_MODE',
  'NEXT_PUBLIC_QUORUM_URL_MAINNET',
  'NEXT_PUBLIC_QUORUM_URL_TESTNET',
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
      quorumUrls: { mainnet: null, testnet: null },
      disableWriteMode: false,
      rateProvider: 'coinbase',
      wellKnownUrl: null,
    });
  });

  it('parses public runtime toggles without rejecting custom devnets', () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'devnet-paloma');
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_TESTNET', 'https://quorums.example.test/');
    vi.stubEnv('NEXT_PUBLIC_DISABLE_WRITE_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_RATE_PROVIDER', 'kucoin');
    vi.stubEnv('NEXT_PUBLIC_WELL_KNOWN_URL', 'https://example.test/well-known.json');

    expect(getConfig()).toEqual({
      defaultNetwork: 'devnet-paloma',
      quorumUrls: { mainnet: null, testnet: 'https://quorums.example.test' },
      disableWriteMode: true,
      rateProvider: 'kucoin',
      wellKnownUrl: 'https://example.test/well-known.json',
    });
  });

  it('ignores the removed trusted-mode toggle and invalid quorum URLs', () => {
    // Untrusted mode cannot query with the pinned WASM SDK; the flag is inert.
    vi.stubEnv('NEXT_PUBLIC_TRUSTED_MODE', 'false');
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_MAINNET', 'not a url');
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_TESTNET', 'ftp://quorums.example.test');
    const config = getConfig();
    expect(config).not.toHaveProperty('trustedMode');
    expect(config.quorumUrls).toEqual({ mainnet: null, testnet: null });
  });

  it('applies the settings-form rule to build-time quorum URLs and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_MAINNET', 'http://quorums.example.test');
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_TESTNET', 'http://127.0.0.1:22444/');
    expect(getConfig().quorumUrls).toEqual({ mainnet: null, testnet: 'http://127.0.0.1:22444' });
    getConfig();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/NEXT_PUBLIC_QUORUM_URL_MAINNET ignored.*https:\/\//);
    warn.mockRestore();
  });

  it('falls back to coinbase (CORS-enabled) for unknown rate providers', () => {
    vi.stubEnv('NEXT_PUBLIC_RATE_PROVIDER', 'not-a-provider');
    expect(getConfig().rateProvider).toBe('coinbase');
  });
});
