// The explorer never holds private keys. Every signer adapter implements this
// minimal interface; the broadcast flow + SDK write facades take an instance
// and call `sign` once per state transition.

export type SignerKind = 'extension' | 'mnemonic' | 'wif';

export interface SignerKeyDescriptor {
  id: number;
  purpose?: string | number;
  type?: string | number;
  securityLevel?: string | number;
}

export interface ExplorerSigner {
  readonly kind: SignerKind;
  readonly identityId: string;
  availableKeys(): Promise<SignerKeyDescriptor[]>;
  /**
   * Sign a state-transition preimage with the identified key.
   * Adapters MUST prompt the user (or delegate to the extension) before
   * producing a signature.
   */
  sign(preimage: Uint8Array, keyId: number): Promise<Uint8Array>;
  /** Zero any in-memory secrets. Called on disconnect / timeout / navigate. */
  destroy(): void;
}

export class SignerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignerUnavailableError';
  }
}
