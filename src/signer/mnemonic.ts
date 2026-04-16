import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner, SignerKeyDescriptor } from './types';
import { SignerUnavailableError } from './types';

/**
 * Build a mnemonic-backed signer. The seed + derived private key live only
 * in the closure captured by the returned ExplorerSigner. destroy() zeros
 * both. No value is ever written to persistent storage.
 *
 * The SDK's wallet namespace is used for derivation; we delegate the actual
 * signing to whatever the WASM SDK exposes via `sign(preimage, privateKey)`.
 */
export async function createMnemonicSigner(
  sdk: EvoSDK,
  mnemonic: string,
  identityId: string,
  network: 'mainnet' | 'testnet',
  accountIndex = 0,
): Promise<ExplorerSigner> {
  // The wallet namespace shape varies between SDK versions. We access it
  // defensively so a missing helper surfaces as a clear error rather than a
  // silent TypeError.
  const wallet = (sdk as unknown as { wallet?: Record<string, unknown> }).wallet;
  if (!wallet) {
    throw new SignerUnavailableError(
      'The SDK build in use does not expose a wallet namespace. Mnemonic signing is unavailable.',
    );
  }

  const validate = wallet.validateMnemonic as undefined | ((m: string) => boolean);
  if (validate && !validate(mnemonic)) {
    throw new SignerUnavailableError('That BIP-39 mnemonic is not valid.');
  }

  const mnemonicToSeed = wallet.mnemonicToSeed as
    | undefined
    | ((m: string, passphrase?: string) => Promise<Uint8Array>);
  if (!mnemonicToSeed) {
    throw new SignerUnavailableError('wallet.mnemonicToSeed is not available in this SDK.');
  }

  let seed: Uint8Array | null = await mnemonicToSeed(mnemonic);
  // Overwrite the caller's mnemonic string as best we can — JS strings are
  // immutable, so we can only hope the caller doesn't retain a reference.

  const derivationPath =
    (network === 'mainnet'
      ? (wallet.derivationPathDip13Mainnet as (account: number) => string | undefined)
      : (wallet.derivationPathDip13Testnet as (account: number) => string | undefined))?.(
      accountIndex,
    );

  const derive = wallet.deriveKeyFromSeedWithPath as
    | undefined
    | ((seed: Uint8Array, path: string) => Promise<Uint8Array> | Uint8Array);
  if (!derive || !derivationPath) {
    throw new SignerUnavailableError(
      'Mnemonic derivation (deriveKeyFromSeedWithPath / derivationPathDip13*) is unavailable in this SDK build.',
    );
  }

  let privateKey: Uint8Array | null = new Uint8Array(await derive(seed, derivationPath));

  const signMessage = wallet.signWithPrivateKey as
    | undefined
    | ((preimage: Uint8Array, privateKey: Uint8Array) => Uint8Array | Promise<Uint8Array>);

  return {
    kind: 'mnemonic',
    identityId,
    async availableKeys(): Promise<SignerKeyDescriptor[]> {
      return [
        {
          id: 0,
          purpose: 'AUTHENTICATION',
          type: 'ECDSA_SECP256K1',
          securityLevel: 'HIGH',
        },
      ];
    },
    async sign(preimage: Uint8Array, _keyId: number) {
      void _keyId;
      if (!privateKey) {
        throw new SignerUnavailableError('Mnemonic signer has been destroyed.');
      }
      if (!signMessage) {
        throw new SignerUnavailableError(
          'wallet.signWithPrivateKey is not available in this SDK build; cannot sign.',
        );
      }
      return signMessage(preimage, privateKey);
    },
    destroy() {
      if (privateKey) {
        privateKey.fill(0);
        privateKey = null;
      }
      if (seed) {
        seed.fill(0);
        seed = null;
      }
    },
  };
}
