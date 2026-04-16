import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner, SignerKeyDescriptor } from './types';
import { SignerUnavailableError } from './types';

export async function createWifSigner(
  sdk: EvoSDK,
  wif: string,
  identityId: string,
): Promise<ExplorerSigner> {
  const wallet = (sdk as unknown as { wallet?: Record<string, unknown> }).wallet;
  if (!wallet) {
    throw new SignerUnavailableError(
      'The SDK build in use does not expose a wallet namespace. WIF signing is unavailable.',
    );
  }
  const keyPairFromWif = wallet.keyPairFromWif as
    | undefined
    | ((wif: string) => Promise<{ privateKey: Uint8Array }> | { privateKey: Uint8Array });
  if (!keyPairFromWif) {
    throw new SignerUnavailableError('wallet.keyPairFromWif is not available in this SDK build.');
  }
  const pair = await keyPairFromWif(wif);
  let privateKey: Uint8Array | null = new Uint8Array(pair.privateKey);

  const signMessage = wallet.signWithPrivateKey as
    | undefined
    | ((preimage: Uint8Array, privateKey: Uint8Array) => Uint8Array | Promise<Uint8Array>);

  return {
    kind: 'wif',
    identityId,
    async availableKeys(): Promise<SignerKeyDescriptor[]> {
      return [{ id: 0, purpose: 'AUTHENTICATION' }];
    },
    async sign(preimage: Uint8Array, _keyId: number) {
      void _keyId;
      if (!privateKey) throw new SignerUnavailableError('WIF signer has been destroyed.');
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
    },
  };
}
