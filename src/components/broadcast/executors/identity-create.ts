// Identity create and top-up funded by an asset lock (sdk.identities.create /
// topUp). The asset-lock proof comes from the form; the one-time asset-lock
// key signs it. A new identity's keys come from a mnemonic or explicit WIFs.

import type { EvoSDK, Identity, IdentitySigner } from '@dashevo/evo-sdk';
import { freeAll, withPrivateKey } from '@/signer/form-keys';
import { prepareNewIdentityKeys, type NewIdentityKeyChoice } from '@/signer/new-identity';
import type { DerivationNetwork as Network } from '@/signer/types';
import { fetchExistingIdentity, type ExecuteArgs, type IdentityResult } from '../executors';
import type { IdentityCreateOptions } from '../forms/identity/IdentityCreate';
import type { IdentityTopUpOptions } from '../forms/identity/IdentityTopUp';
import { assertAssetLockKey } from './asset-lock-key';
import { executeFormSigned, loadAssetLockProof } from './form-signed';

/**
 * The identity to create, with its keys, and a signer holding their private
 * keys. The keys must be the ones reviewed (by their public key hashes).
 * Refuses keys another identity already uses: Platform would reject the
 * transition after it consumed the funding.
 */
export async function buildNewIdentity(
  sdk: EvoSDK,
  { source, publicKeyHashes }: NewIdentityKeyChoice,
  network: Network,
  identityId: string,
): Promise<{ identity: Identity; signer: IdentitySigner; release(): void }> {
  const keys = await prepareNewIdentityKeys(source, network);
  let identity: Identity | undefined;
  try {
    if (keys.publicKeyHashes.join() !== publicKeyHashes.join())
      throw new Error('The new identity keys no longer match the reviewed key hashes.');
    for (const [id, hash] of keys.publicKeyHashes.entries()) {
      const existing = await sdk.identities.byPublicKeyHash(hash);
      if (existing) {
        const owner = existing.id;
        const ownerId = owner.toBase58();
        freeAll(owner, existing);
        throw new Error(
          `New key #${id} is already a key of identity ${ownerId}. ` +
            (source.kind === 'mnemonic'
              ? 'Choose an identity index this wallet has not used yet.'
              : 'Use keys no identity has.'),
        );
      }
    }
    const { Identity } = await import('@dashevo/evo-sdk');
    identity = new Identity(identityId);
    for (const key of keys.publicKeys) identity.addPublicKey(key);
  } catch (error) {
    freeAll(identity);
    keys.release();
    throw error;
  }
  const created = identity;
  return {
    identity: created,
    signer: keys.signer,
    release() {
      freeAll(created);
      keys.release();
    },
  };
}

export async function executeIdentityCreate({
  sdk,
  options,
  assertCurrent,
  network: explorerNetwork,
}: ExecuteArgs<IdentityCreateOptions>): Promise<IdentityResult> {
  return executeFormSigned(sdk, async (submit, onRelease) => {
    const { network, proof } = options;
    const assetLockProof = await loadAssetLockProof(proof.proofHex, onRelease);
    const derived = assetLockProof.createIdentityId();
    const identityId = derived.toBase58();
    freeAll(derived);
    if (identityId !== proof.identityId)
      throw new Error('The asset-lock proof no longer matches the reviewed identity ID.');
    // An asset lock funds exactly one identity, whose ID it determines.
    const existing = await sdk.identities.fetch(identityId);
    if (existing) {
      freeAll(existing);
      throw new Error(`This asset lock already created identity ${identityId}.`);
    }
    const created = await buildNewIdentity(sdk, options.keys, network, identityId);
    onRelease(created.release);
    return withPrivateKey(
      options.assetLockKeyWif,
      network,
      'asset-lock private key',
      async (key) => {
        await assertAssetLockKey(assetLockProof, key, explorerNetwork ?? network);
        await submit(
          () =>
            sdk.identities.create({
              identity: created.identity,
              assetLockProof,
              assetLockPrivateKey: key,
              signer: created.signer,
            }),
          { identityId },
          assertCurrent,
        );
        return {
          kind: 'identity' as const,
          identityId,
          message: `Created identity ${identityId} from asset lock ${proof.outPoint}.`,
        };
      },
    );
  });
}

export async function executeIdentityTopUp({
  sdk,
  options,
  assertCurrent,
  network: explorerNetwork,
}: ExecuteArgs<IdentityTopUpOptions>): Promise<IdentityResult> {
  return executeFormSigned(sdk, async (submit, onRelease) => {
    const { network, proof, identityId } = options;
    const assetLockProof = await loadAssetLockProof(proof.proofHex, onRelease);
    const identity = await fetchExistingIdentity(sdk, identityId);
    onRelease(() => freeAll(identity));
    return withPrivateKey(
      options.assetLockKeyWif,
      network,
      'asset-lock private key',
      async (key) => {
        await assertAssetLockKey(assetLockProof, key, explorerNetwork ?? network);
        const newBalance = await submit(
          () => sdk.identities.topUp({ identity, assetLockProof, assetLockPrivateKey: key }),
          { identityId },
          assertCurrent,
        );
        return {
          kind: 'identity' as const,
          identityId,
          message: `Topped up ${identityId} from asset lock ${proof.outPoint}.`,
          newBalance: String(newBalance),
        };
      },
    );
  });
}
