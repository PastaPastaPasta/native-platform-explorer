// The explorer never holds private keys on disk. Every signer adapter
// implements this interface; the broadcast flow + SDK write facades take an
// instance and either:
//   - call `sign(preimage, keyId)` to get raw signature bytes (legacy adapters);
//   - call `prepareSdk(keyId)` to obtain a wasm IdentitySigner + IdentityPublicKey
//     to hand to a SDK facade method directly.
// Adapters that integrate with the EvoSDK write API implement `prepareSdk`;
// raw-preimage-only adapters (older WIF/mnemonic preview shims) may omit it.

import type { IdentityPublicKey, IdentitySigner } from '@dashevo/evo-sdk';

export type SignerKind = 'extension' | 'mnemonic' | 'wif' | 'backup';

export interface SignerKeyDescriptor {
  id: number;
  purpose?: string | number;
  type?: string | number;
  securityLevel?: string | number;
}

export interface KeySelectionCriteria {
  /** Desired key purpose, e.g. 'AUTHENTICATION', 'TRANSFER', 'OWNER'. */
  purpose?: string;
  /** Minimum security level. Higher is stronger: MASTER > CRITICAL > HIGH > MEDIUM. */
  minSecurityLevel?: 'MASTER' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
  /** Explicit key id (skips selection logic). */
  keyId?: number;
}

export interface SdkSigningMaterial {
  /** wasm IdentityPublicKey to pass as `identityKey` to SDK methods. */
  identityKey: IdentityPublicKey;
  /** wasm IdentitySigner to pass as `signer`. Preloaded with the relevant WIF. */
  identitySigner: IdentitySigner;
  /** Identity ID this material is for (base58). */
  identityId: string;
  /** Selected key id (matches identityKey.keyId). */
  keyId: number;
}

export interface ExplorerSigner {
  readonly kind: SignerKind;
  readonly identityId: string;
  availableKeys(): Promise<SignerKeyDescriptor[]>;
  /**
   * Sign a state-transition preimage with the identified key. Used by older
   * adapters that don't plug directly into the SDK facades.
   * Adapters MUST prompt the user (or delegate to the extension) before
   * producing a signature.
   */
  sign(preimage: Uint8Array, keyId: number): Promise<Uint8Array>;
  /**
   * Produce the wasm objects needed to invoke an SDK facade write method.
   * Adapters that can't do this (e.g. extension placeholders) return null.
   * `criteria` lets the caller hint at a key purpose / security level; the
   * adapter picks the best matching key it holds.
   */
  prepareSdk?(criteria?: KeySelectionCriteria): Promise<SdkSigningMaterial>;
  /** Zero any in-memory secrets. Called on disconnect / timeout / navigate. */
  destroy(): void;
}

export class SignerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignerUnavailableError';
  }
}
