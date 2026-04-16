import { DEFAULT_NETWORK, type Network } from '@sdk/networks';

export type RateProvider = 'kucoin' | 'coinbase' | 'none';

export interface AppConfig {
  defaultNetwork: Network;
  trustedMode: boolean;
  dapiAddresses: Record<Network, string[]>;
  disableWriteMode: boolean;
  rateProvider: RateProvider;
  wellKnownUrl: string | null;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
}

function parseAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

function parseRateProvider(raw: string | undefined): RateProvider {
  if (raw === 'coinbase' || raw === 'none') return raw;
  return 'kucoin';
}

export function getConfig(): AppConfig {
  const rawNet = process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
  const defaultNetwork: Network =
    rawNet === 'mainnet' || rawNet === 'testnet' ? rawNet : DEFAULT_NETWORK;

  return {
    defaultNetwork,
    trustedMode: parseBool(process.env.NEXT_PUBLIC_TRUSTED_MODE, true),
    dapiAddresses: {
      testnet: parseAddresses(process.env.NEXT_PUBLIC_DAPI_ADDRESSES_TESTNET),
      mainnet: parseAddresses(process.env.NEXT_PUBLIC_DAPI_ADDRESSES_MAINNET),
    },
    disableWriteMode: parseBool(process.env.NEXT_PUBLIC_DISABLE_WRITE_MODE, false),
    rateProvider: parseRateProvider(process.env.NEXT_PUBLIC_RATE_PROVIDER),
    wellKnownUrl: process.env.NEXT_PUBLIC_WELL_KNOWN_URL || null,
  };
}
