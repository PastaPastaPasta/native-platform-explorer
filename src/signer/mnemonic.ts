import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner } from './types';
import { SignerUnavailableError } from './types';
import { createLocalSigner, decodeWif, type ImportedPrivateKey } from './local';

/** Key indexes scanned per identity; wallets and the bridge number keys from 0. */
export const IDENTITY_KEY_SCAN_DEPTH = 16;

/**
 * DIP-13 identity authentication key path (ECDSA key type 0):
 * m/9'/coin'/5'/0'/0'/identityIndex'/keyIndex'. The SDK's
 * derivationPathDip13* helpers only return the m/9'/coin'/account' prefix.
 */
export function identityKeyPath(
  network: 'mainnet' | 'testnet',
  identityIndex: number,
  keyIndex: number,
): string {
  const coinType = network === 'mainnet' ? 5 : 1;
  return `m/9'/${coinType}'/5'/0'/0'/${identityIndex}'/${keyIndex}'`;
}

/**
 * Derive the identity's DIP-13 keys (or one explicit path). Only derived keys
 * that match enabled on-chain public data are kept by the local signer.
 */
export async function createMnemonicSigner(
  sdk: EvoSDK,
  mnemonic: string,
  identityId: string,
  network: 'mainnet' | 'testnet',
  identityIndex = 0,
  path?: string,
): Promise<ExplorerSigner> {
  const { wallet } = await import('@dashevo/evo-sdk');
  if (!(await wallet.validateMnemonic(mnemonic))) {
    throw new SignerUnavailableError('That BIP-39 mnemonic is not valid.');
  }
  const explicitPath = path?.trim();
  // An explicit path imports exactly that key; the identity index is unused.
  if (
    !explicitPath &&
    (!Number.isSafeInteger(identityIndex) || identityIndex < 0 || identityIndex >= 2 ** 31)
  ) {
    throw new SignerUnavailableError('Enter an identity index from 0 to 2147483647.');
  }
  const paths = explicitPath
    ? [explicitPath]
    : Array.from({ length: IDENTITY_KEY_SCAN_DEPTH }, (_, keyIndex) =>
        identityKeyPath(network, identityIndex, keyIndex),
      );
  const imported: ImportedPrivateKey[] = [];
  try {
    for (const derivationPath of paths) {
      const derived = await wallet.deriveKeyFromSeedWithPath({
        mnemonic,
        path: derivationPath,
        network,
      });
      try {
        imported.push(await decodeWif(derived.privateKeyWif));
      } finally {
        derived.free();
      }
    }
  } catch (error) {
    imported.forEach((key) => key.bytes.fill(0));
    throw error;
  }
  return createLocalSigner(sdk, 'mnemonic', identityId, imported);
}
