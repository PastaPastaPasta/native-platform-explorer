// Review views of operations whose inputs hold private keys: the secrets are
// replaced by a marker, everything else is shown as reviewed.

import { describeNewIdentityKeys, type NewIdentityKeyChoice } from '@/signer/new-identity';
import type { DerivationNetwork } from '@/signer/types';

export function redactAddressKey<T extends { inputKeyWif: string }>({
  inputKeyWif: _secret,
  ...rest
}: T) {
  return { ...rest, inputKey: 'provided (hidden)' };
}

export function redactAssetLockKey<T extends { assetLockKeyWif: string }>({
  assetLockKeyWif: _secret,
  ...rest
}: T) {
  return { ...rest, assetLockKey: 'provided (hidden)' };
}

export function redactVotingKey<T extends { votingKeyWif: string }>({
  votingKeyWif: _secret,
  ...rest
}: T) {
  return { ...rest, votingKey: 'provided (hidden)' };
}

/** New identity keys show their layout and public key hashes, never their secrets. */
export function redactNewIdentityKeys<
  T extends { network: DerivationNetwork; keys: NewIdentityKeyChoice },
>({ keys, ...rest }: T) {
  return { ...rest, keys: describeNewIdentityKeys(keys, rest.network) };
}
