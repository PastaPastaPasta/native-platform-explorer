export type Network = string;

export type NetworkType = 'mainnet' | 'testnet' | 'devnet';

export interface NetworkConfig {
  /** Discriminator. Devnets share testnet HRP/derivation but use custom DAPI addresses. */
  type: NetworkType;
  name: Network;
  label: string;
  /** Public block explorer URL for this network (Platform). Optional for devnets. */
  explorerBaseUrl?: string;
  /** Layer-1 block explorer URL (Insight UI), used for outbound deep links. */
  l1ExplorerBaseUrl?: string;
  /** Insight API base, e.g. for devnet links. */
  insightApiUrl?: string;
  /** Faucet URL (devnets/testnet). */
  faucetBaseUrl?: string;
  /** Custom DAPI masternode endpoints (required for devnets). */
  dapiAddresses?: string[];
}

export const TESTNET: NetworkConfig = {
  type: 'testnet',
  name: 'testnet',
  label: 'Testnet',
  explorerBaseUrl: 'https://testnet.platform-explorer.com',
  l1ExplorerBaseUrl: 'http://insight.testnet.networks.dash.org/insight',
  insightApiUrl: 'https://insight.testnet.networks.dash.org/insight-api',
  faucetBaseUrl: 'https://faucet.thepasta.org',
};

export const MAINNET: NetworkConfig = {
  type: 'mainnet',
  name: 'mainnet',
  label: 'Mainnet',
  explorerBaseUrl: 'https://platform-explorer.com',
  l1ExplorerBaseUrl: 'https://insight.dash.org/insight',
  insightApiUrl: 'https://insight.dash.org/insight-api',
};

export const DEVNET_PALOMA: NetworkConfig = {
  type: 'devnet',
  name: 'devnet-paloma',
  label: 'Devnet-paloma',
  dapiAddresses: [
    'https://68.67.122.198:1443',
    'https://68.67.122.199:1443',
    'https://68.67.122.86:1443',
    'https://68.67.122.197:1443',
    'https://68.67.122.192:1443',
    'https://68.67.122.85:1443',
    'https://68.67.122.88:1443',
    'https://68.67.122.206:1443',
    'https://68.67.122.193:1443',
    'https://68.67.122.195:1443',
    'https://68.67.122.196:1443',
    'https://68.67.122.87:1443',
    'https://68.67.122.207:1443',
  ],
};

const BUILT_INS: readonly NetworkConfig[] = [TESTNET, MAINNET, DEVNET_PALOMA];
const BUILT_IN_NAMES: ReadonlySet<string> = new Set(BUILT_INS.map((n) => n.name));

const NETWORK_REGISTRY = new Map<string, NetworkConfig>(BUILT_INS.map((n) => [n.name, n]));

const CUSTOM_DEVNETS_KEY = 'npe:customDevnets';

export const DEFAULT_NETWORK: Network = 'testnet';

export function isBuiltInNetwork(name: string): boolean {
  return BUILT_IN_NAMES.has(name);
}

function isValidNetworkConfig(value: unknown): value is NetworkConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    c.type === 'devnet' &&
    typeof c.name === 'string' &&
    c.name.length > 0 &&
    (c.label === undefined || typeof c.label === 'string') &&
    (c.insightApiUrl === undefined || typeof c.insightApiUrl === 'string') &&
    (c.faucetBaseUrl === undefined || typeof c.faucetBaseUrl === 'string') &&
    Array.isArray(c.dapiAddresses) &&
    c.dapiAddresses.every((a) => typeof a === 'string' && a.length > 0)
  );
}

function loadCustomDevnets(): NetworkConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_DEVNETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => isValidNetworkConfig(c) && !isBuiltInNetwork(c.name));
  } catch {
    return [];
  }
}

function persistCustomDevnets(): void {
  if (typeof window === 'undefined') return;
  const customs = Array.from(NETWORK_REGISTRY.values()).filter(
    (n) => !isBuiltInNetwork(n.name),
  );
  window.localStorage.setItem(CUSTOM_DEVNETS_KEY, JSON.stringify(customs));
}

/** Idempotent — load saved custom devnets into the in-memory registry. */
export function initNetworkRegistry(): void {
  for (const cfg of loadCustomDevnets()) {
    NETWORK_REGISTRY.set(cfg.name, cfg);
  }
}

export function getNetwork(name: string): NetworkConfig {
  return NETWORK_REGISTRY.get(name) ?? TESTNET;
}

export function hasNetwork(name: string): boolean {
  return NETWORK_REGISTRY.has(name);
}

/**
 * Project a network name down to the closest mainnet/testnet equivalent for
 * APIs that don't know about devnets (key derivation, broadcast forms, etc).
 * Devnets always map to testnet — same HRP, same DIP-13 derivation path.
 */
export function getDerivationNetwork(name: string): 'mainnet' | 'testnet' {
  return getNetwork(name).type === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getAvailableNetworks(): NetworkConfig[] {
  return Array.from(NETWORK_REGISTRY.values());
}

export function saveCustomDevnet(config: NetworkConfig): void {
  if (isBuiltInNetwork(config.name)) {
    throw new Error(`Network name "${config.name}" is reserved`);
  }
  if (config.type !== 'devnet') {
    throw new Error('Only devnet configs can be saved as custom networks');
  }
  NETWORK_REGISTRY.set(config.name, config);
  persistCustomDevnets();
}

export function removeCustomDevnet(name: string): void {
  if (isBuiltInNetwork(name)) return;
  NETWORK_REGISTRY.delete(name);
  persistCustomDevnets();
}

export interface CreateCustomDevnetParams {
  name: string;
  label?: string;
  insightApiUrl?: string;
  dapiAddresses: string[];
  faucetBaseUrl?: string;
}

export function createCustomDevnetConfig(params: CreateCustomDevnetParams): NetworkConfig {
  return { type: 'devnet', ...params, label: params.label ?? params.name };
}
