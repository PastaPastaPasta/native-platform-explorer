// System data contract IDs. Testnet IDs are confirmed; mainnet TODOs are
// flagged where we do not yet have the authoritative identifier.

export interface SystemContract {
  key: string;
  name: string;
  description: string;
  testnetId: string;
  mainnetId: string | null;
}

export const SYSTEM_DATA_CONTRACTS: SystemContract[] = [
  {
    key: 'dpns',
    name: 'DPNS',
    description: 'Dash Platform Name Service — decentralised human-readable usernames.',
    testnetId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    mainnetId: null, // TODO: confirm mainnet DPNS contract id.
  },
  {
    key: 'withdrawals',
    name: 'Withdrawals',
    description: 'Credit withdrawals back to the L1 chain.',
    testnetId: '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6',
    mainnetId: null, // TODO.
  },
  {
    key: 'dashpay',
    name: 'Dashpay',
    description: 'Dashpay social profile + contact request flow.',
    testnetId: '',
    mainnetId: null,
  },
  {
    key: 'masternode-rewards',
    name: 'Masternode reward shares',
    description: 'Reward distribution between operators and voting keys.',
    testnetId: '',
    mainnetId: null,
  },
  {
    key: 'feature-flags',
    name: 'Feature flags',
    description: 'Protocol feature flags set by governance.',
    testnetId: '',
    mainnetId: null,
  },
  {
    key: 'wallet-utils',
    name: 'Wallet utils',
    description: 'Shared wallet utility contract.',
    testnetId: '',
    mainnetId: null,
  },
  {
    key: 'keyword-search',
    name: 'Keyword search',
    description: 'Keyword index for on-chain document discovery.',
    testnetId: '',
    mainnetId: null,
  },
];
