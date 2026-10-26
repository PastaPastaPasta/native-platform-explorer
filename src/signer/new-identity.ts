// Keys for an identity that does not exist yet. Platform needs every new
// ECDSA_SECP256K1 key to sign the create transition (proof of possession), so
// the private keys are loaded into an IdentitySigner for that one call.

import type { IdentityPublicKey, IdentitySigner } from '@dashevo/evo-sdk';
import { freeAll, loadPrivateKey } from './form-keys';
import { identityKeyPath } from './mnemonic';
import { SignerUnavailableError } from './types';

type Network = 'mainnet' | 'testnet';

const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>;

export type NewKeyPurpose = 'AUTHENTICATION' | 'TRANSFER';
export type NewKeyLevel = 'MASTER' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface NewKeySpec {
  purpose: NewKeyPurpose;
  securityLevel: NewKeyLevel;
}

/** Levels Platform accepts for each purpose in an identity create transition. */
export const NEW_KEY_LEVELS: Record<NewKeyPurpose, readonly NewKeyLevel[]> = {
  AUTHENTICATION: ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'],
  TRANSFER: ['CRITICAL'],
};

/** Platform's max_public_keys_in_creation. */
export const MAX_NEW_IDENTITY_KEYS = 6;

/**
 * Keys derived from a mnemonic: key ID n uses DIP-13 key index n, so the
 * mnemonic signer on /wallet finds them again.
 */
export const DEFAULT_NEW_IDENTITY_KEYS: readonly NewKeySpec[] = [
  { purpose: 'AUTHENTICATION', securityLevel: 'MASTER' },
  { purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL' },
  { purpose: 'AUTHENTICATION', securityLevel: 'HIGH' },
  { purpose: 'TRANSFER', securityLevel: 'CRITICAL' },
];

export type NewIdentityKeySource =
  | { kind: 'mnemonic'; mnemonic: string; identityIndex: number }
  | { kind: 'wif'; keys: (NewKeySpec & { privateKeyWif: string })[] };

export function newIdentityKeyCount(source: NewIdentityKeySource): number {
  return source.kind === 'mnemonic' ? DEFAULT_NEW_IDENTITY_KEYS.length : source.keys.length;
}

/** A review-safe description of the keys a source creates (no secrets). */
export function describeNewIdentityKeys(source: NewIdentityKeySource, network: Network) {
  return source.kind === 'mnemonic'
    ? DEFAULT_NEW_IDENTITY_KEYS.map((spec, id) => ({
        id,
        ...spec,
        derivationPath: identityKeyPath(network, source.identityIndex, id),
      }))
    : source.keys.map(({ purpose, securityLevel }, id) => ({ id, purpose, securityLevel }));
}

/** Null when the explicit key list is acceptable to Platform, otherwise why not. */
export function newKeySpecsError(specs: readonly NewKeySpec[]): string | null {
  if (!specs.length) return 'Add at least one key.';
  if (specs.length > MAX_NEW_IDENTITY_KEYS)
    return `An identity can be created with at most ${MAX_NEW_IDENTITY_KEYS} keys.`;
  if (!specs.some((s) => s.purpose === 'AUTHENTICATION' && s.securityLevel === 'MASTER'))
    return 'A new identity needs a MASTER authentication key.';
  if (specs.some((s) => !NEW_KEY_LEVELS[s.purpose]?.includes(s.securityLevel)))
    return 'Transfer keys must be CRITICAL.';
  return null;
}

export interface NewIdentityKeys {
  publicKeys: IdentityPublicKey[];
  /** Holds every new key's private key, to sign the proofs of possession. */
  signer: IdentitySigner;
  /** HASH160 of each public key, in key ID order. */
  publicKeyHashes: string[];
  release(): void;
}

export async function prepareNewIdentityKeys(
  source: NewIdentityKeySource,
  network: Network,
): Promise<NewIdentityKeys> {
  const { IdentityPublicKey, IdentitySigner, wallet } = await import('@dashevo/evo-sdk');
  const specs = source.kind === 'mnemonic' ? DEFAULT_NEW_IDENTITY_KEYS : source.keys;
  const specError = newKeySpecsError(specs);
  if (specError) throw new SignerUnavailableError(specError);
  if (source.kind === 'mnemonic') {
    if (!(await wallet.validateMnemonic(source.mnemonic)))
      throw new SignerUnavailableError('That BIP-39 mnemonic is not valid.');
    if (
      !Number.isSafeInteger(source.identityIndex) ||
      source.identityIndex < 0 ||
      source.identityIndex >= 2 ** 31
    )
      throw new SignerUnavailableError('Enter an identity index from 0 to 2147483647.');
  }

  const signer = new IdentitySigner();
  const publicKeys: IdentityPublicKey[] = [];
  const publicKeyHashes: string[] = [];
  try {
    for (const [id, spec] of specs.entries()) {
      let wif: string;
      if (source.kind === 'mnemonic') {
        const derived = await wallet.deriveKeyFromSeedWithPath({
          mnemonic: source.mnemonic,
          path: identityKeyPath(network, source.identityIndex, id),
          network,
        });
        try {
          wif = derived.privateKeyWif;
        } finally {
          freeAll(derived);
        }
      } else {
        wif = source.keys[id]!.privateKeyWif;
      }
      const key = await loadPrivateKey(wif, network, `private key for new key #${id}`);
      try {
        const publicKey = key.getPublicKey();
        try {
          publicKeys.push(
            new IdentityPublicKey({
              keyId: id,
              purpose: lower(spec.purpose),
              securityLevel: lower(spec.securityLevel),
              keyType: 'ecdsa_secp256k1',
              data: publicKey.toBytes(),
            }),
          );
        } finally {
          freeAll(publicKey);
        }
        publicKeyHashes.push(key.getPublicKeyHash());
        signer.addKey(key);
      } finally {
        freeAll(key);
      }
    }
    if (new Set(publicKeyHashes).size !== publicKeyHashes.length)
      throw new SignerUnavailableError('The same private key is listed for two new keys.');
  } catch (error) {
    freeAll(signer, ...publicKeys);
    throw error;
  }
  let released = false;
  return {
    publicKeys,
    signer,
    publicKeyHashes,
    release() {
      if (released) return;
      released = true;
      freeAll(signer, ...publicKeys);
    },
  };
}
