import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDevnetSdkArgs } from '../SdkProvider';
import {
  buildSdkOptions,
  defaultConnectionSettings,
  parseConnectionSettings,
  quorumUrlError,
  resolveQuorumUrl,
} from '../connection-settings';
import { removeCustomDevnet, saveCustomDevnet, createCustomDevnetConfig } from '../networks';

afterEach(() => {
  vi.unstubAllEnvs();
  removeCustomDevnet('devnet-addresses-only');
});

describe('getDevnetSdkArgs', () => {
  it('passes the configured DAPI addresses alongside the derived quorum service', () => {
    // No `quorumUrl` override: the SDK derives
    // https://quorums.paloma.networks.dash.org from `devnetName`.
    const args = getDevnetSdkArgs('devnet-paloma');
    expect(args).toMatchObject({ name: 'paloma', addresses: expect.arrayContaining(['https://68.67.122.198:1443']) });
    expect(args).not.toHaveProperty('quorumUrl');
  });

  it('rejects non-devnets', () => {
    expect(() => getDevnetSdkArgs('testnet')).toThrow('not a devnet');
  });
});

describe('buildSdkOptions', () => {
  it('always builds a trusted SDK and sends the log level explicitly', () => {
    expect(buildSdkOptions('testnet', defaultConnectionSettings())).toEqual({ network: 'testnet', trusted: true, logs: 'warn' });
    expect(buildSdkOptions('mainnet', defaultConnectionSettings())).toEqual({ network: 'mainnet', trusted: true, logs: 'warn' });
  });

  it('maps request settings 1:1 to the SDK and omits SDK defaults', () => {
    const settings = { ...defaultConnectionSettings(), connectTimeoutMs: 1500, retries: 0, banFailedAddress: false, logLevel: 'debug' as const };
    expect(buildSdkOptions('testnet', settings)).toEqual({
      network: 'testnet',
      trusted: true,
      logs: 'debug',
      settings: { connectTimeoutMs: 1500, retries: 0, banFailedAddress: false },
    });
  });

  it('uses a stored quorum service override before the build-time one', () => {
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_MAINNET', 'https://env.example.test');
    const settings = defaultConnectionSettings();
    expect(buildSdkOptions('mainnet', settings)).toMatchObject({ quorumUrl: 'https://env.example.test' });
    settings.quorumUrls.mainnet = 'https://user.example.test';
    expect(buildSdkOptions('mainnet', settings)).toMatchObject({ quorumUrl: 'https://user.example.test' });
    expect(resolveQuorumUrl('testnet', settings)).toBeNull();
  });

  it('keeps devnet addresses and quorum URL together for the trusted devnet constructor', () => {
    saveCustomDevnet(createCustomDevnetConfig({
      name: 'devnet-addresses-only',
      dapiAddresses: ['https://10.0.0.1:1443'],
    }));
    expect(buildSdkOptions('devnet-addresses-only', defaultConnectionSettings())).toEqual({
      network: 'devnet',
      trusted: true,
      logs: 'warn',
      devnetName: 'addresses-only',
      addresses: ['https://10.0.0.1:1443'],
    });
  });
});

describe('connection settings parsing', () => {
  it('drops invalid stored fields individually', () => {
    expect(parseConnectionSettings({
      startupTimeoutMs: 5,
      connectTimeoutMs: 2500,
      retries: -1,
      banFailedAddress: 'yes',
      logLevel: 'loud',
      quorumUrls: { mainnet: 'ftp://x', testnet: 'https://quorums.example.test/' },
    })).toEqual({
      ...defaultConnectionSettings(),
      connectTimeoutMs: 2500,
      quorumUrls: { mainnet: null, testnet: 'https://quorums.example.test' },
    });
    expect(parseConnectionSettings('nonsense')).toEqual(defaultConnectionSettings());
  });

  it('accepts only absolute HTTPS quorum URLs (HTTP for loopback)', () => {
    expect(quorumUrlError('https://quorums.example.test')).toBeNull();
    expect(quorumUrlError('http://127.0.0.1:22444')).toBeNull();
    expect(quorumUrlError('http://quorums.example.test')).toMatch(/https/);
    expect(quorumUrlError('quorums.example.test')).toMatch(/absolute/);
    expect(quorumUrlError('https://quorums.example.test/?a=1')).toMatch(/query/);
  });
});
