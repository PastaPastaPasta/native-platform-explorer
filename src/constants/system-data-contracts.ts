// System data contract IDs. These are deterministically derived from the
// platform genesis + contract schemas, so they're identical on testnet and
// mainnet. Sourced from packages/*-contract/lib/systemIds.js in the
// dashpay/platform repo.

export interface SystemContract {
  key: string;
  name: string;
  description: string;
  testnetId: string;
  mainnetId: string | null;
  /** Whether this contract declares contested resource indexes. */
  contested?: boolean;
}

// Every system contract shares the sentinel owner (all-ones base58) and a
// fixed contractId; they deploy identically across networks.
const SAME_ON_BOTH = (id: string) => ({ testnetId: id, mainnetId: id });

export const SYSTEM_DATA_CONTRACTS: SystemContract[] = [
  {
    key: 'dpns',
    name: 'DPNS',
    description: 'Dash Platform Name Service — decentralised human-readable usernames.',
    ...SAME_ON_BOTH('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'),
    contested: true,
  },
  {
    key: 'withdrawals',
    name: 'Withdrawals',
    description: 'Credit withdrawals back to the L1 chain.',
    ...SAME_ON_BOTH('4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6'),
  },
  {
    key: 'dashpay',
    name: 'Dashpay',
    description: 'Dashpay social profile + contact request flow.',
    ...SAME_ON_BOTH('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'),
  },
  {
    key: 'masternode-rewards',
    name: 'Masternode reward shares',
    description: 'Reward distribution between operators and voting keys.',
    ...SAME_ON_BOTH('rUnsWrFu3PKyRMGk2mxmZVBPbQuZx2qtHeFjURoQevX'),
  },
  {
    key: 'feature-flags',
    name: 'Feature flags',
    description: 'Protocol feature flags set by governance.',
    ...SAME_ON_BOTH('HY1keaRK5bcDmujNCQq5pxNyvAiHHpoHQgLN5ppiu4kh'),
  },
  {
    key: 'wallet-utils',
    name: 'Wallet utils',
    description: 'Shared wallet utility contract.',
    ...SAME_ON_BOTH('7CSFGeF4WNzgDmx94zwvHkYaG3Dx4XEe5LFsFgJswLbm'),
  },
  {
    key: 'keyword-search',
    name: 'Keyword search',
    description: 'Keyword index for on-chain document discovery.',
    ...SAME_ON_BOTH('BsjE6tQxG47wffZCRQCovFx5rYrAYYC3rTVRWKro27LA'),
  },
  {
    key: 'token-history',
    name: 'Token history',
    description: 'Historical token distribution + transfer records.',
    ...SAME_ON_BOTH('43gujrzZgXqcKBiScLa4T8XTDnRhenR9BLx8GWVHjPxF'),
  },
];
