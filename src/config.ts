import { DEFAULT_NETWORK, type Network } from '@sdk/networks';

export type RateProvider = 'kucoin' | 'coinbase' | 'none';

export interface AppConfig {
  defaultNetwork: Network;
  trustedMode: boolean;
  disableWriteMode: boolean;
  rateProvider: RateProvider;
  wellKnownUrl: string | null;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
}

function parseRateProvider(raw: string | undefined): RateProvider {
  if (raw === 'coinbase' || raw === 'none') return raw;
  return 'kucoin';
}

export function getConfig(): AppConfig {
  const rawNet = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  // Final validation against the registry happens in SdkProvider; here we just
  // accept any non-empty string so devnets can be set via env.
  const defaultNetwork: Network = rawNet && rawNet.length > 0 ? rawNet : DEFAULT_NETWORK;

  return {
    defaultNetwork,
    trustedMode: parseBool(process.env.NEXT_PUBLIC_TRUSTED_MODE, true),
    disableWriteMode: parseBool(process.env.NEXT_PUBLIC_DISABLE_WRITE_MODE, false),
    rateProvider: parseRateProvider(process.env.NEXT_PUBLIC_RATE_PROVIDER),
    wellKnownUrl: process.env.NEXT_PUBLIC_WELL_KNOWN_URL || null,
  };
}
