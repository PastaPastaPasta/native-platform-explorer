import type { ExplorerSigner, SignerKeyDescriptor } from './types';
import { SignerUnavailableError } from './types';

// The Dash Platform Extension exposes a signer API through `window.dashPlatform`
// (subject to change). At the time Stage 6 was authored the extension's public
// surface wasn't fully documented. We detect its presence and implement a stub
// that throws a clear error if the user tries to sign — rather than silently
// doing the wrong thing. When the real API is finalised, swap this out.

declare global {
  interface Window {
    dashPlatform?: {
      isConnected?: () => Promise<boolean>;
      connect?: () => Promise<{ identityId: string }>;
      sign?: (preimage: Uint8Array, keyId: number) => Promise<Uint8Array>;
      availableKeys?: () => Promise<SignerKeyDescriptor[]>;
    };
  }
}

export async function detectExtension(timeoutMs = 400): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.dashPlatform) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !!window.dashPlatform;
}

export async function createExtensionSigner(): Promise<ExplorerSigner> {
  if (!window.dashPlatform) {
    throw new SignerUnavailableError(
      'Dash Platform Extension not detected. Install the extension or use a mnemonic / WIF signer.',
    );
  }
  const ext = window.dashPlatform;
  if (!ext.connect) {
    throw new SignerUnavailableError(
      'Dash Platform Extension is present but its connect() API is not yet implemented in this build. ' +
        'Extension signing is tracked as a follow-up; please use mnemonic or WIF until then.',
    );
  }
  const { identityId } = await ext.connect();

  return {
    kind: 'extension',
    identityId,
    async availableKeys() {
      return ext.availableKeys ? ext.availableKeys() : [];
    },
    async sign(preimage, keyId) {
      if (!ext.sign) {
        throw new SignerUnavailableError(
          'Dash Platform Extension.sign() not available in this build.',
        );
      }
      return ext.sign(preimage, keyId);
    },
    destroy() {
      // The extension owns its own lifecycle; nothing to zero here.
    },
  };
}
