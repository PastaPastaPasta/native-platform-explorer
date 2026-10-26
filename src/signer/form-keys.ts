// Private keys an operation collects in its own form: Platform address keys,
// the one-time asset-lock key, and a masternode voting key. Like the local
// signer, each key is decoded from a WIF without quoting SDK parser messages,
// checked against the network, loaded into WASM, and its decoded bytes are
// zeroed straight away. Nothing is persisted, and the WASM objects are freed
// once the operation settles.

import type { PlatformAddressSigner, PrivateKey } from '@dashevo/evo-sdk';
import { decodeWif } from './local';
import { SignerUnavailableError } from './types';

type Network = 'mainnet' | 'testnet';

/** Best-effort `free()` for WASM objects that may already be released. */
export function freeAll(...objects: ({ free(): void } | null | undefined)[]): void {
  for (const object of objects) {
    try {
      object?.free();
    } catch {
      /* already freed */
    }
  }
}

async function decodeForNetwork(wif: string, network: Network, label: string) {
  const decoded = await decodeWif(wif.trim()).catch(() => {
    throw new SignerUnavailableError(`The ${label} is not a valid WIF private key.`);
  });
  if (decoded.network !== network) {
    decoded.bytes.fill(0);
    throw new SignerUnavailableError(`The ${label} is for ${decoded.network}, not ${network}.`);
  }
  return decoded;
}

/**
 * A WASM private key for one operation. The decoded bytes are zeroed before
 * this returns; the caller frees the key (see `withPrivateKey`).
 */
export async function loadPrivateKey(
  wif: string,
  network: Network,
  label: string,
): Promise<PrivateKey> {
  const { PrivateKey } = await import('@dashevo/evo-sdk');
  const decoded = await decodeForNetwork(wif, network, label);
  try {
    return PrivateKey.fromBytes(decoded.bytes, network);
  } finally {
    decoded.bytes.fill(0);
  }
}

/** Run `fn` with a one-time private key and free the key afterwards, whatever happens. */
export async function withPrivateKey<T>(
  wif: string,
  network: Network,
  label: string,
  fn: (key: PrivateKey) => Promise<T>,
): Promise<T> {
  const key = await loadPrivateKey(wif, network, label);
  try {
    return await fn(key);
  } finally {
    freeAll(key);
  }
}

export interface AddressSigningMaterial {
  /** WASM signer holding the input addresses' keys; pass it as the SDK's `signer`. */
  signer: PlatformAddressSigner;
  /** The P2PKH Platform address (bech32m) each key controls, in input order. */
  addresses: string[];
  /** Free the signer and the keys it holds. Safe to call more than once. */
  release(): void;
}

/** Load the private keys of Platform address inputs into a PlatformAddressSigner. */
export async function createAddressSigner(
  wifs: string[],
  network: Network,
): Promise<AddressSigningMaterial> {
  const { PlatformAddressSigner } = await import('@dashevo/evo-sdk');
  const signer = new PlatformAddressSigner();
  const addresses: string[] = [];
  try {
    for (const wif of wifs) {
      const key = await loadPrivateKey(wif, network, 'address private key');
      try {
        const address = signer.addKey(key);
        try {
          addresses.push(address.toBech32m(network));
        } finally {
          freeAll(address);
        }
      } finally {
        freeAll(key);
      }
    }
    if (new Set(addresses).size !== addresses.length)
      throw new SignerUnavailableError('The same address private key is listed twice.');
  } catch (error) {
    freeAll(signer);
    throw error;
  }
  let released = false;
  return {
    signer,
    addresses,
    release() {
      if (released) return;
      released = true;
      freeAll(signer);
    },
  };
}

/** The Platform address a WIF controls, for showing in a form before review. */
export async function platformAddressForWif(wif: string, network: Network): Promise<string> {
  const material = await createAddressSigner([wif], network);
  try {
    return material.addresses[0]!;
  } finally {
    material.release();
  }
}
