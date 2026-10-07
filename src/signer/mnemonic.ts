import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner } from './types';
import { SignerUnavailableError } from './types';
import { createLocalSigner, decodeWif } from './local';

/** Derive an explicit SDK path; a derived key must match enabled on-chain public data. */
export async function createMnemonicSigner(
  sdk: EvoSDK,
  mnemonic: string,
  identityId: string,
  network: 'mainnet' | 'testnet',
  accountIndex = 0,
  path?: string,
): Promise<ExplorerSigner> {
  const { wallet } = await import('@dashevo/evo-sdk');
  if (!(await wallet.validateMnemonic(mnemonic))) {
    throw new SignerUnavailableError('That BIP-39 mnemonic is not valid.');
  }
  let derivationPath = path?.trim();
  if (!derivationPath) {
    const info = await (network === 'mainnet'
      ? wallet.derivationPathDip13Mainnet(accountIndex)
      : wallet.derivationPathDip13Testnet(accountIndex));
    try {
      derivationPath = info.path;
    } finally {
      info.free();
    }
  }
  const derived = await wallet.deriveKeyFromSeedWithPath({
    mnemonic,
    path: derivationPath,
    network,
  });
  try {
    const imported = await decodeWif(derived.privateKeyWif);
    return await createLocalSigner(sdk, 'mnemonic', identityId, [imported]);
  } finally {
    derived.free();
  }
}
