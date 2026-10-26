import { DEFAULT_NETWORK, type Network } from '@sdk/networks';

export type RateProvider = 'kucoin' | 'coinbase' | 'none';

export interface AppConfig {
  defaultNetwork: Network;
  /** Build-time trusted quorum service overrides for the built-in networks
   *  (`NEXT_PUBLIC_QUORUM_URL_MAINNET` / `_TESTNET`). */
  quorumUrls: { mainnet: string | null; testnet: string | null };
  disableWriteMode: boolean;
  rateProvider: RateProvider;
  wellKnownUrl: string | null;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
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

const warnedQuorumEnv = new Set<string>();

/** Build-time quorum URLs follow the same rule as the settings form. A
 *  rejected value falls back to the SDK default, with one console warning. */
function parseQuorumUrl(name: string, raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const error = quorumUrlError(value);
  if (!error) return value.replace(/\/+$/, '');
  if (!warnedQuorumEnv.has(`${name}=${value}`)) {
    warnedQuorumEnv.add(`${name}=${value}`);
    console.warn(`${name} ignored, using the default quorum service: ${error}`);
  }
  return null;
}

// Coinbase is the default: KuCoin's API sends no CORS headers, so browsers
// block it. `kucoin` remains an explicit opt-in (see .env.local.example).
function parseRateProvider(raw: string | undefined): RateProvider {
  if (raw === 'kucoin' || raw === 'none') return raw;
  return 'coinbase';
}

export function getConfig(): AppConfig {
  const rawNet = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  // Final validation against the registry happens in SdkProvider; here we just
  // accept any non-empty string so devnets can be set via env.
  const defaultNetwork: Network = rawNet && rawNet.length > 0 ? rawNet : DEFAULT_NETWORK;

  return {
    defaultNetwork,
    quorumUrls: {
      mainnet: parseQuorumUrl('NEXT_PUBLIC_QUORUM_URL_MAINNET', process.env.NEXT_PUBLIC_QUORUM_URL_MAINNET),
      testnet: parseQuorumUrl('NEXT_PUBLIC_QUORUM_URL_TESTNET', process.env.NEXT_PUBLIC_QUORUM_URL_TESTNET),
    },
    disableWriteMode: parseBool(process.env.NEXT_PUBLIC_DISABLE_WRITE_MODE, false),
    rateProvider: parseRateProvider(process.env.NEXT_PUBLIC_RATE_PROVIDER),
    wellKnownUrl: process.env.NEXT_PUBLIC_WELL_KNOWN_URL || null,
  };
}
