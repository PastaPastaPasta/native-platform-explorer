export type Network = 'mainnet' | 'testnet';

export interface NetworkConfig {
  name: Network;
  label: string;
  explorerBaseUrl: string;
  l1ExplorerBaseUrl: string;
}

// Mirrors /Users/pasta/workspace/platform-explorer/packages/frontend/src/constants/networks.js.
export const networkConfig: Record<Network, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    label: 'Mainnet',
    explorerBaseUrl: 'https://platform-explorer.com',
    l1ExplorerBaseUrl: 'https://insight.dash.org/insight',
  },
  testnet: {
    name: 'testnet',
    label: 'Testnet',
    explorerBaseUrl: 'https://testnet.platform-explorer.com',
    l1ExplorerBaseUrl: 'http://insight.testnet.networks.dash.org/insight',
  },
};

export const DEFAULT_NETWORK: Network = 'testnet';
