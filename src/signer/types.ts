// The explorer never holds private keys on disk. Every signer adapter
// implements this interface; the broadcast flow + SDK write facades take an
// instance and either:
//   - call `sign(preimage, keyId)` to get raw signature bytes (legacy adapters);
//   - call `prepareSdk(keyId)` to obtain a wasm IdentitySigner + IdentityPublicKey
//     to hand to a SDK facade method directly.
// Local adapters implement `prepareSdk`; raw-only extension adapters cannot
// execute SDK operations and are reported as unsupported by the wallet UI.

import type { EvoSDK, IdentityPublicKey, IdentitySigner } from '@dashevo/evo-sdk';

export type SignerKind = 'extension' | 'mnemonic' | 'wif' | 'backup';

export interface SignerKeyDescriptor {
  id: number;
  purpose?: string | number;
  type?: string | number;
  securityLevel?: string | number;
  disabledAt?: bigint;
}

export interface KeySelectionCriteria {
  /** Desired key purpose, e.g. 'AUTHENTICATION', 'TRANSFER', 'OWNER'. */
  purpose?: string;
  /**
   * Minimum security level the selected key must satisfy. MASTER is the
   * strongest, MEDIUM the weakest — a key at or stronger than the requested
   * level qualifies (so requiring HIGH also accepts CRITICAL and MASTER keys).
   * Transitions may exclude MASTER or require an exact level; executors should
   * use allowedSecurityLevels for those protocol requirements.
   */
  minSecurityLevel?: 'MASTER' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
  /** Exact levels accepted by the transition. MASTER is excluded from ordinary authentication writes. */
  allowedSecurityLevels?: Array<'MASTER' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>;
  /** Explicit key id; purpose and security requirements still apply. */
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
  /** Release owned WASM allocations after execution, including failure paths. */
  release?: () => void;
}

export interface ExplorerSigner {
  readonly kind: SignerKind;
  readonly identityId: string;
  /** SDK session used to validate local key material. */
  readonly sdk?: EvoSDK;
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
