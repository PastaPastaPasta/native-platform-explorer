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

function parseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
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
      mainnet: parseUrl(process.env.NEXT_PUBLIC_QUORUM_URL_MAINNET),
      testnet: parseUrl(process.env.NEXT_PUBLIC_QUORUM_URL_TESTNET),
    },
    disableWriteMode: parseBool(process.env.NEXT_PUBLIC_DISABLE_WRITE_MODE, false),
    rateProvider: parseRateProvider(process.env.NEXT_PUBLIC_RATE_PROVIDER),
    wellKnownUrl: process.env.NEXT_PUBLIC_WELL_KNOWN_URL || null,
  };
}
