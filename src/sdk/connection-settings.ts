import type { EvoSDKOptions } from '@dashevo/evo-sdk';
import { getConfig } from '@/config';
import { devnetShortName, getNetwork, type Network, type NetworkConfig } from './networks';

/** Levels accepted by the SDK's `logs` option (an EnvFilter string). The
 * filter is process-global in the WASM module, so the explorer always sends
 * one explicitly instead of leaving a previous session's level in place. */
export const SDK_LOG_LEVELS = ['off', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type SdkLogLevel = (typeof SDK_LOG_LEVELS)[number];

export type QuorumNetwork = 'mainnet' | 'testnet';

/**
 * Locally persisted SDK connection preferences. `null` means "SDK default".
 * Request settings map 1:1 to the pinned SDK's `ConnectionOptions.settings`;
 * `startupTimeoutMs` is the explorer's own deadline for `connect()` (quorum
 * prefetch), which the SDK does not bound.
 */
export interface ConnectionSettings {
  startupTimeoutMs: number;
  connectTimeoutMs: number | null;
  requestTimeoutMs: number | null;
  retries: number | null;
  banFailedAddress: boolean | null;
  logLevel: SdkLogLevel;
  /** Trusted quorum service overrides for the built-in networks. The service
   *  supplies both the quorum public keys and the DAPI masternode list. */
  quorumUrls: Record<QuorumNetwork, string | null>;
}

export const CONNECTION_SETTINGS_KEY = 'npe:connectionSettings';
export const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;

export const SETTING_LIMITS = {
  startupTimeoutMs: { min: 2_000, max: 300_000 },
  connectTimeoutMs: { min: 100, max: 120_000 },
  requestTimeoutMs: { min: 100, max: 300_000 },
  retries: { min: 0, max: 20 },
} as const;

/** Defaults before any local preference: env quorum URLs, SDK request defaults. */
export function defaultConnectionSettings(): ConnectionSettings {
  return {
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    connectTimeoutMs: null,
    requestTimeoutMs: null,
    retries: null,
    banFailedAddress: null,
    logLevel: 'warn',
    quorumUrls: { mainnet: null, testnet: null },
  };
}

/** A quorum service URL must be absolute HTTPS (HTTP only for loopback). */
export function quorumUrlError(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return 'Enter an absolute URL, e.g. https://quorums.example.org'; }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return 'Use https:// (http:// is allowed only for localhost).';
  if (url.search || url.hash) return 'Remove the query string and fragment.';
  return null;
}

function intIn(value: unknown, { min, max }: { min: number; max: number }): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function urlOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && !quorumUrlError(value) ? value.replace(/\/+$/, '') : null;
}

/** Tolerant parse of stored JSON: invalid fields fall back individually. */
export function parseConnectionSettings(raw: unknown): ConnectionSettings {
  const defaults = defaultConnectionSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Record<string, unknown>;
  const urls = (r.quorumUrls && typeof r.quorumUrls === 'object' ? r.quorumUrls : {}) as Record<string, unknown>;
  return {
    startupTimeoutMs: intIn(r.startupTimeoutMs, SETTING_LIMITS.startupTimeoutMs) ?? defaults.startupTimeoutMs,
    connectTimeoutMs: intIn(r.connectTimeoutMs, SETTING_LIMITS.connectTimeoutMs),
    requestTimeoutMs: intIn(r.requestTimeoutMs, SETTING_LIMITS.requestTimeoutMs),
    retries: intIn(r.retries, SETTING_LIMITS.retries),
    banFailedAddress: typeof r.banFailedAddress === 'boolean' ? r.banFailedAddress : null,
    logLevel: SDK_LOG_LEVELS.includes(r.logLevel as SdkLogLevel) ? (r.logLevel as SdkLogLevel) : defaults.logLevel,
    quorumUrls: { mainnet: urlOrNull(urls.mainnet), testnet: urlOrNull(urls.testnet) },
  };
}

export function sameConnectionSettings(a: ConnectionSettings, b: ConnectionSettings): boolean {
  return JSON.stringify(parseConnectionSettings(a)) === JSON.stringify(parseConnectionSettings(b));
}

/** Effective quorum service override for a network: local preference, then
 *  build-time env, then the network registry (devnets). `null` = SDK default. */
export function resolveQuorumUrl(network: Network, settings: ConnectionSettings): string | null {
  const cfg = getNetwork(network);
  if (cfg.type === 'devnet') return cfg.quorumUrl ?? null;
  const env = getConfig().quorumUrls[cfg.type];
  return settings.quorumUrls[cfg.type] ?? (env && !quorumUrlError(env) ? env : null);
}

/** Devnet arguments for the trusted SDK. Exported so tests can pin them. */
export interface DevnetSdkArgs {
  name: string;
  quorumUrl?: string;
  /** Configured DAPI addresses. The SDK's trusted context replaces them with
   *  the quorum service's masternode list when that list is non-empty, so
   *  these only take effect for services that do not publish masternodes. */
  addresses?: string[];
}

export function getDevnetSdkArgs(network: Network): DevnetSdkArgs {
  const cfg = getNetwork(network);
  if (cfg.type !== 'devnet') {
    throw new Error(`Network "${network}" is not a devnet`);
  }
  return {
    name: devnetShortName(cfg),
    ...(cfg.quorumUrl ? { quorumUrl: cfg.quorumUrl } : {}),
    ...(cfg.dapiAddresses?.length ? { addresses: [...cfg.dapiAddresses] } : {}),
  };
}

/**
 * Options for `new EvoSDK(...)`. Always trusted: the pinned SDK cannot run
 * proof-bearing queries without a trusted context ("Non-trusted mode is not
 * supported in WASM") and panics when `proofs: false` is requested.
 */
export function buildSdkOptions(network: Network, settings: ConnectionSettings): EvoSDKOptions {
  const cfg: NetworkConfig = getNetwork(network);
  const requestSettings: NonNullable<EvoSDKOptions['settings']> = {};
  if (settings.connectTimeoutMs !== null) requestSettings.connectTimeoutMs = settings.connectTimeoutMs;
  if (settings.requestTimeoutMs !== null) requestSettings.timeoutMs = settings.requestTimeoutMs;
  if (settings.retries !== null) requestSettings.retries = settings.retries;
  if (settings.banFailedAddress !== null) requestSettings.banFailedAddress = settings.banFailedAddress;
  const connection: EvoSDKOptions = {
    trusted: true,
    logs: settings.logLevel,
    ...(Object.keys(requestSettings).length ? { settings: requestSettings } : {}),
  };
  if (cfg.type === 'devnet') {
    const { name, ...rest } = getDevnetSdkArgs(network);
    return { ...connection, network: 'devnet', devnetName: name, ...rest };
  }
  const quorumUrl = resolveQuorumUrl(network, settings);
  return { ...connection, network: cfg.type, ...(quorumUrl ? { quorumUrl } : {}) };
}
