import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner } from './types';
import { createLocalSigner, decodeWif } from './local';

export async function createWifSigner(
  sdk: EvoSDK,
  wif: string,
  identityId: string,
): Promise<ExplorerSigner> {
  const imported = await decodeWif(wif);
  return createLocalSigner(sdk, 'wif', identityId, [imported]);
}
