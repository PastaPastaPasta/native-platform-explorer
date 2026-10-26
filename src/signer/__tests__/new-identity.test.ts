import { beforeAll, describe, expect, it } from 'vitest';
import { PrivateKey, wallet } from '@dashevo/evo-sdk';
import { identityKeyPath } from '../mnemonic';
import {
  DEFAULT_NEW_IDENTITY_KEYS,
  describeNewIdentityKeys,
  newIdentityKeyCount,
  newKeySpecsError,
  prepareNewIdentityKeys,
} from '../new-identity';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const wif = (n: number, network: 'testnet' | 'mainnet' = 'testnet') =>
  PrivateKey.fromHex(n.toString(16).padStart(64, '0'), network).toWIF();

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
});

describe('new identity keys', () => {
  it('derives the default layout on the DIP-13 identity paths the mnemonic signer scans', async () => {
    const keys = await prepareNewIdentityKeys(
      { kind: 'mnemonic', mnemonic: MNEMONIC, identityIndex: 2 },
      'testnet',
    );
    try {
      expect(keys.publicKeys.map((k) => [k.keyId, k.purpose, k.securityLevel, k.keyType])).toEqual([
        [0, 'AUTHENTICATION', 'MASTER', 'ECDSA_SECP256K1'],
        [1, 'AUTHENTICATION', 'CRITICAL', 'ECDSA_SECP256K1'],
        [2, 'AUTHENTICATION', 'HIGH', 'ECDSA_SECP256K1'],
        [3, 'TRANSFER', 'CRITICAL', 'ECDSA_SECP256K1'],
      ]);
      expect(keys.signer.keyCount).toBe(4);
      for (const [id, key] of keys.publicKeys.entries()) {
        const derived = await wallet.deriveKeyFromSeedWithPath({
          mnemonic: MNEMONIC,
          path: identityKeyPath('testnet', 2, id),
          network: 'testnet',
        });
        expect(key.getPublicKeyHash()).toBe(
          PrivateKey.fromWIF(derived.privateKeyWif).getPublicKeyHash(),
        );
        expect(keys.publicKeyHashes[id]).toBe(key.getPublicKeyHash());
      }
    } finally {
      keys.release();
      keys.release();
    }
  });

  it('describes keys for review without the mnemonic or WIFs', () => {
    const view = describeNewIdentityKeys(
      { kind: 'mnemonic', mnemonic: MNEMONIC, identityIndex: 1 },
      'testnet',
    );
    expect(view).toHaveLength(DEFAULT_NEW_IDENTITY_KEYS.length);
    expect(view[0]).toEqual({
      id: 0,
      purpose: 'AUTHENTICATION',
      securityLevel: 'MASTER',
      derivationPath: "m/9'/1'/5'/0'/0'/1'/0'",
    });
    expect(JSON.stringify(view)).not.toContain('abandon');
    expect(newIdentityKeyCount({ kind: 'wif', keys: [] })).toBe(0);
  });

  it('accepts explicit keys in list order and checks the layout Platform requires', async () => {
    const keys = await prepareNewIdentityKeys(
      {
        kind: 'wif',
        keys: [
          { purpose: 'AUTHENTICATION', securityLevel: 'MASTER', privateKeyWif: wif(5) },
          { purpose: 'TRANSFER', securityLevel: 'CRITICAL', privateKeyWif: wif(6) },
        ],
      },
      'testnet',
    );
    expect(keys.publicKeys.map((k) => k.keyId)).toEqual([0, 1]);
    keys.release();

    expect(newKeySpecsError([])).toMatch(/at least one key/);
    expect(newKeySpecsError([{ purpose: 'AUTHENTICATION', securityLevel: 'HIGH' }])).toMatch(
      /MASTER/,
    );
    expect(
      newKeySpecsError([
        { purpose: 'AUTHENTICATION', securityLevel: 'MASTER' },
        { purpose: 'TRANSFER', securityLevel: 'HIGH' },
      ]),
    ).toMatch(/CRITICAL/);
    expect(
      newKeySpecsError(Array(7).fill({ purpose: 'AUTHENTICATION', securityLevel: 'MASTER' })),
    ).toMatch(/at most 6/);
  });

  it.each([
    [
      () => ({ kind: 'mnemonic' as const, mnemonic: 'not a mnemonic', identityIndex: 0 }),
      /mnemonic is not valid/,
    ],
    [
      () => ({ kind: 'mnemonic' as const, mnemonic: MNEMONIC, identityIndex: -1 }),
      /identity index/,
    ],
    [
      () => ({
        kind: 'wif' as const,
        keys: [
          {
            purpose: 'AUTHENTICATION' as const,
            securityLevel: 'MASTER' as const,
            privateKeyWif: wif(5, 'mainnet'),
          },
        ],
      }),
      /for mainnet, not testnet/,
    ],
    [
      () => ({
        kind: 'wif' as const,
        keys: [
          {
            purpose: 'AUTHENTICATION' as const,
            securityLevel: 'MASTER' as const,
            privateKeyWif: wif(5),
          },
          {
            purpose: 'AUTHENTICATION' as const,
            securityLevel: 'HIGH' as const,
            privateKeyWif: wif(5),
          },
        ],
      }),
      /same private key/,
    ],
  ])('refuses %# before building anything', async (source, error) => {
    await expect(prepareNewIdentityKeys(source(), 'testnet')).rejects.toThrow(error);
  });
});
