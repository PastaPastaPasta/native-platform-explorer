import { SYSTEM_DATA_CONTRACTS } from './system-data-contracts';

export type WellKnownKind = 'contract' | 'token' | 'identity';

export interface WellKnown {
  id: string;
  kind: WellKnownKind;
  name: string;
  description?: string;
  url?: string;
  tags?: string[];
  /** The network this ID exists on. Absent for IDs that are identical on
   *  every network (system contracts). */
  network?: string;
  contested?: { docType: string; indexName: string; indexValuePrefix?: unknown[] };
}

// Curated registry — the only way we give names to otherwise anonymous contract
// and token IDs. These system contracts deploy identically on every network.
// Components that need network-specific entries, remote (`NEXT_PUBLIC_WELL_KNOWN_URL`)
// or local (Settings) entries use `useWellKnownRegistry` instead.
export const WELL_KNOWN: WellKnown[] = SYSTEM_DATA_CONTRACTS.filter((c) => c.testnetId).map(
  (c) => ({
    id: c.testnetId,
    kind: 'contract' as const,
    name: c.name,
    description: c.description,
    tags: ['system'],
    contested: c.contested,
  }),
);

// Network-specific entries. Every ID was checked live with the pinned SDK
// (tokens.contractInfo + tokens.totalSupply, identities.fetch + dpns.username,
// contracts.getMany) on 2026-10-26. Names are the tokens' own localized names
// and the identities' DPNS names; an identity without a DPNS name is described
// by what it owns.
const NETWORK_WELL_KNOWN: WellKnown[] = [
  // mainnet
  {
    id: 'DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd',
    kind: 'token',
    name: 'DUSD',
    description: 'Dash USD, a USD stablecoin token.',
    network: 'mainnet',
  },
  {
    id: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB',
    kind: 'token',
    name: 'SANS',
    description: 'Sansnote, the governance and utility token of the Sansbank community.',
    network: 'mainnet',
  },
  {
    id: '8CkcAPokwFdxEu2tUu2VdLTjgK3eeR1wUGJcxhjsWaDz',
    kind: 'contract',
    name: 'DUSD token contract',
    network: 'mainnet',
  },
  {
    id: 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR',
    kind: 'contract',
    name: 'SANS token contract',
    network: 'mainnet',
  },
  {
    id: '3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE',
    kind: 'identity',
    name: 'DUSD and SANS owner',
    description: 'Owner of the DUSD and SANS token contracts.',
    network: 'mainnet',
  },
  {
    id: 'EWSqsaghuwHRjtutbXK3nR11KbRkg9a12PNAAkJWRTpY',
    kind: 'identity',
    name: 'latte.dash',
    network: 'mainnet',
  },
  // testnet
  {
    id: '3oTHkj8nqn82QkZRHkmUmNBX696nzE1rg1fwPRpemEdz',
    kind: 'token',
    name: 'tDUSD',
    description: 'Testnet deployment of the DUSD stablecoin token.',
    network: 'testnet',
  },
  {
    id: 'A36eJF2kyYXwxCtJGsgbR3CTAscUFaNxZN19UqUfM1kw',
    kind: 'token',
    name: 'tSANS',
    description: 'Testnet deployment of the SANS token.',
    network: 'testnet',
  },
  {
    id: 'GWghYQoDFEb3osEfigrF7CKdZLWauxC7TwM4jsJyqa23',
    kind: 'contract',
    name: 'tDUSD token contract',
    network: 'testnet',
  },
  {
    id: '2EUW1Do3exKMDKaj9uh5jkPPSUcrMgXfWUraiz6ALrwP',
    kind: 'contract',
    name: 'tSANS token contract',
    network: 'testnet',
  },
  {
    id: 'AFaVqRJCWXFZRUhuq6ZUUcWXVW8fErCN3wpEtgsBnDZm',
    kind: 'identity',
    name: 'atlanta-degen-for-life.dash',
    description: 'Owner of the tDUSD and tSANS token contracts.',
    network: 'testnet',
  },
];

/** Every bundled entry, network-independent and network-specific. */
export const BUNDLED_WELL_KNOWN: WellKnown[] = [...WELL_KNOWN, ...NETWORK_WELL_KNOWN];

/** True when an entry applies to `network` (no network means every network). */
export function onNetwork(entry: Pick<WellKnown, 'network'>, network: string | undefined): boolean {
  return !entry.network || !network || entry.network === network;
}

/** Bundled lookup. Pass the network to ignore other networks' entries. */
export function findWellKnown(id: string, network?: string): WellKnown | undefined {
  return BUNDLED_WELL_KNOWN.find((w) => w.id === id && onNetwork(w, network));
}
