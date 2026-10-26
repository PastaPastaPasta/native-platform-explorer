import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PlatformAddressSigner, PrivateKey, wallet } from '@dashevo/evo-sdk';
import * as local from '../local';
import {
  createAddressSigner,
  loadPrivateKey,
  platformAddressForWif,
  withPrivateKey,
} from '../form-keys';

// Real WASM SDK, throwaway keys; nothing touches the network.
let testnetWif: string;
let mainnetWif: string;
const ADDRESS = 'tdash1kp63uahgrxged4z5jswyt5dn5v3lzsem6cwarqfg';

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  testnetWif = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet').toWIF();
  mainnetWif = PrivateKey.fromHex('0'.repeat(63) + '1', 'mainnet').toWIF();
});

/** Capture the decoded byte arrays so the test can check they were zeroed. */
function spyDecodedBytes() {
  const decoded: Uint8Array[] = [];
  const original = local.decodeWif;
  const spy = vi.spyOn(local, 'decodeWif').mockImplementation(async (wif) => {
    const result = await original(wif);
    decoded.push(result.bytes);
    return result;
  });
  return { decoded, restore: () => spy.mockRestore() };
}

describe('form key adapters', () => {
  it('derives the P2PKH Platform address a key controls and zeroes the decoded key', async () => {
    const { decoded, restore } = spyDecodedBytes();
    try {
      const material = await createAddressSigner([testnetWif], 'testnet');
      expect(material.addresses).toEqual([ADDRESS]);
      expect(material.signer.hasKey(ADDRESS)).toBe(true);
      expect(decoded).toHaveLength(1);
      expect(decoded[0]!.every((byte) => byte === 0)).toBe(true);
      const free = vi.spyOn(material.signer, 'free');
      material.release();
      material.release();
      expect(free).toHaveBeenCalledOnce();
    } finally {
      restore();
    }
  });

  it('rejects keys for another network and invalid keys without quoting them', async () => {
    await expect(createAddressSigner([mainnetWif], 'testnet')).rejects.toThrow(
      'The address private key is for mainnet, not testnet.',
    );
    const error = (await createAddressSigner(['not-a-real-wif-secret'], 'testnet').catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toBe('The address private key is not a valid WIF private key.');
    expect(error.message).not.toContain('not-a-real-wif-secret');
  });

  it('frees the signer when a later key fails, and refuses duplicate keys', async () => {
    const free = vi.spyOn(PlatformAddressSigner.prototype, 'free');
    try {
      await expect(createAddressSigner([testnetWif, 'bad'], 'testnet')).rejects.toThrow();
      expect(free).toHaveBeenCalled();
      await expect(createAddressSigner([testnetWif, testnetWif], 'testnet')).rejects.toThrow(
        'listed twice',
      );
    } finally {
      free.mockRestore();
    }
  });

  it('previews an address without keeping the key', async () => {
    await expect(platformAddressForWif(` ${testnetWif} `, 'testnet')).resolves.toBe(ADDRESS);
  });

  it('frees one-time keys after use, including when the operation fails', async () => {
    const key = await loadPrivateKey(testnetWif, 'testnet', 'asset-lock private key');
    expect(key.getPublicKeyHash()).toBe('751e76e8199196d454941c45d1b3a323f1433bd6');
    key.free();

    let seen: PrivateKey | undefined;
    await expect(
      withPrivateKey(testnetWif, 'testnet', 'voting key', async (k) => {
        seen = k;
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
    // A freed WASM object has no pointer left.
    expect((seen as unknown as { __wbg_ptr: number }).__wbg_ptr).toBe(0);
    await expect(withPrivateKey(mainnetWif, 'testnet', 'voting key', vi.fn())).rejects.toThrow(
      'The voting key is for mainnet, not testnet.',
    );
  });
});
