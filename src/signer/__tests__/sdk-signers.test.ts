import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DataContract,
  DataContractCreateTransition,
  DataContractUpdateTransition,
  Identity,
  IdentityCreditTransfer,
  IdentityCreditWithdrawalTransition,
  IdentityPublicKey,
  PlatformVersion,
  PrivateKey,
  wallet,
} from '@dashevo/evo-sdk';
import type { EvoSDK, IdentityPublicKeyOptions } from '@dashevo/evo-sdk';
import { createBackupSigner } from '../backup';
import { createMnemonicSigner } from '../mnemonic';
import { createWifSigner } from '../wif';
import { createLocalSigner } from '../local';
import { operationRequirement } from '@components/broadcast/capabilities';

// These public fixtures are deterministic test keys. Only the network read is
// mocked: derivation, WIF decoding, public-key validation and WASM signing
// material use the actual pinned SDK. No state transition is broadcast.
const ID = '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr';
const HEX = '0'.repeat(63) + '1';
const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let wif: string;
let data: Uint8Array;

beforeAll(async () => {
  const pair = await wallet.keyPairFromHex(HEX, 'testnet');
  wif = pair.privateKeyWif;
  data = Uint8Array.from(pair.publicKey.match(/.{2}/g)!, (byte) => parseInt(byte, 16));
  pair.free();
});

function fixture(initial: Partial<IdentityPublicKeyOptions> = {}) {
  let options: IdentityPublicKeyOptions[] = [
    {
      keyId: 4,
      purpose: 0,
      securityLevel: 2,
      keyType: 0,
      data,
      ...initial,
    },
  ];
  const fetch = vi.fn(async () => {
    const identity = new Identity(ID);
    options.forEach((options) => {
      const key = new IdentityPublicKey(options);
      identity.addPublicKey(key);
      key.free();
    });
    return identity;
  });
  const sdk = { identities: { fetch } } as unknown as EvoSDK;
  return {
    sdk,
    fetch,
    changeKeys(next: IdentityPublicKeyOptions[]) {
      options = next;
    },
  };
}

describe('SDK-compatible signers', () => {
  it('prepares WIF signing material with the actual on-chain key ID and releases it', async () => {
    const { sdk, fetch } = fixture();
    const signer = await createWifSigner(sdk, wif, ID);
    expect(await signer.availableKeys()).toEqual([
      {
        id: 4,
        purpose: 'AUTHENTICATION',
        type: 'ECDSA_SECP256K1',
        securityLevel: 'HIGH',
        disabledAt: undefined,
      },
    ]);
    const material = await signer.prepareSdk!({
      purpose: 'AUTHENTICATION',
      minSecurityLevel: 'HIGH',
    });
    expect(material.identitySigner.keyCount).toBe(1);
    expect(material.identityKey.keyId).toBe(4);
    expect(material.keyId).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(3);
    material.release!();
    expect(() => material.identitySigner.keyCount).toThrow();
    expect(() => material.identityKey.keyId).toThrow();
    expect(() => material.release!()).not.toThrow();
    signer.destroy();
    await expect(signer.availableKeys()).rejects.toThrow(/disconnected/);
    await expect(signer.prepareSdk!()).rejects.toThrow(/disconnected/);
  });

  it('validates ECDSA_HASH160 public data using the SDK', async () => {
    const privateKey = PrivateKey.fromWIF(wif);
    const hash = Uint8Array.from(privateKey.getPublicKeyHash().match(/.{2}/g)!, (byte) =>
      parseInt(byte, 16),
    );
    privateKey.free();
    const { sdk } = fixture({ keyType: 2, data: hash });
    const signer = await createWifSigner(sdk, wif, ID);
    expect((await signer.availableKeys())[0]?.type).toBe('ECDSA_HASH160');
    signer.destroy();
  });

  it('derives a mnemonic using asynchronous exported wallet utilities and an explicit path', async () => {
    const derived = await wallet.deriveKeyFromSeedWithPath({
      mnemonic: PHRASE,
      path: "m/9'/1'/13'/0'",
      network: 'testnet',
    });
    const mnemonicData = Uint8Array.from(derived.publicKey.match(/.{2}/g)!, (byte) =>
      parseInt(byte, 16),
    );
    derived.free();
    const { sdk } = fixture({ data: mnemonicData });
    const signer = await createMnemonicSigner(sdk, PHRASE, ID, 'testnet', 0, "m/9'/1'/13'/0'");
    const material = await signer.prepareSdk!({ purpose: 'AUTHENTICATION' });
    expect(material.identitySigner.keyCount).toBe(1);
    material.release!();
    signer.destroy();
    await expect(createMnemonicSigner(sdk, 'invalid mnemonic', ID, 'testnet')).rejects.toThrow(
      /not valid/,
    );
  });

  it('uses the SDK DIP-13 default path instead of assuming a synchronous string API', async () => {
    const info = await wallet.derivationPathDip13Testnet(0);
    const path = info.path;
    info.free();
    const derived = await wallet.deriveKeyFromSeedWithPath({
      mnemonic: PHRASE,
      path,
      network: 'testnet',
    });
    const keyData = Uint8Array.from(derived.publicKey.match(/.{2}/g)!, (byte) =>
      parseInt(byte, 16),
    );
    derived.free();
    const { sdk } = fixture({ data: keyData });
    const signer = await createMnemonicSigner(sdk, PHRASE, ID, 'testnet');
    expect((await signer.availableKeys())[0]?.id).toBe(4);
    signer.destroy();
  });

  it('rejects a WIF whose private key does not correspond to on-chain public data', async () => {
    const { sdk } = fixture({
      data: Uint8Array.from(data, (byte, i) => (i === 10 ? byte ^ 1 : byte)),
    });
    await expect(createWifSigner(sdk, wif, ID)).rejects.toThrow(/do not match/);
  });

  it('uses on-chain backup metadata and never falls back to another purpose', async () => {
    const { sdk } = fixture();
    const signer = await createBackupSigner(sdk, {
      identityId: ID,
      keys: [{ id: 4, purpose: 'TRANSFER', securityLevel: 'MASTER', privateKeyWif: wif }],
    });
    expect((await signer.availableKeys())[0]).toMatchObject({
      purpose: 'AUTHENTICATION',
      securityLevel: 'HIGH',
    });
    await expect(signer.prepareSdk!({ purpose: 'TRANSFER' })).rejects.toThrow(
      /No enabled matching/,
    );
    await expect(signer.prepareSdk!({ keyId: 4, minSecurityLevel: 'MASTER' })).rejects.toThrow(
      /No enabled matching/,
    );
    signer.destroy();
  });

  it('checks backup key IDs and private/public correspondence rather than trusting ID alone', async () => {
    const { sdk } = fixture();
    await expect(
      createBackupSigner(sdk, {
        identityId: ID,
        keys: [{ id: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', privateKeyWif: wif }],
      }),
    ).rejects.toThrow(/do not match/);
    const wrong = await wallet.keyPairFromHex('0'.repeat(63) + '2', 'testnet');
    const wrongWif = wrong.privateKeyWif;
    wrong.free();
    await expect(
      createBackupSigner(sdk, {
        identityId: ID,
        keys: [
          { id: 4, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', privateKeyWif: wrongWif },
        ],
      }),
    ).rejects.toThrow(/do not match/);
  });

  it('rechecks current on-chain disabled status immediately before preparing a signature', async () => {
    const { sdk, changeKeys } = fixture();
    const signer = await createWifSigner(sdk, wif, ID);
    changeKeys([
      {
        keyId: 4,
        purpose: 0,
        securityLevel: 2,
        keyType: 0,
        data,
        disabledAt: 1,
      },
    ]);
    expect(await signer.availableKeys()).toEqual([]);
    await expect(signer.prepareSdk!({ purpose: 'AUTHENTICATION' })).rejects.toThrow(
      /No enabled matching/,
    );
    signer.destroy();
    await expect(createWifSigner(sdk, wif, ID)).rejects.toThrow(/do not match/);
  });

  it('wipes owned byte arrays on failed import and disconnect', async () => {
    const { sdk } = fixture();
    const bytes = Uint8Array.from(HEX.match(/.{2}/g)!, (byte) => parseInt(byte, 16));
    const signer = await createLocalSigner(sdk, 'wif', ID, [{ bytes, network: 'testnet' }]);
    signer.destroy();
    expect(bytes.every((byte) => byte === 0)).toBe(true);
    const failed = new Uint8Array(32).fill(2);
    await expect(
      createLocalSigner(sdk, 'wif', 'invalid', [{ bytes: failed, network: 'testnet' }]),
    ).rejects.toThrow(/valid identity/);
    expect(failed.every((byte) => byte === 0)).toBe(true);
  });

  it('does not resurrect a signer disconnected while an identity lookup was pending', async () => {
    const { sdk, fetch } = fixture();
    const signer = await createWifSigner(sdk, wif, ID);
    let resolve!: (identity: Identity) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Identity>((done) => {
          resolve = done;
        }),
    );
    const pending = signer.availableKeys();
    signer.destroy();
    resolve(new Identity(ID));
    await expect(pending).rejects.toThrow(/disconnected/);
  });

  it('selects keys accepted by the actual pinned SDK contract transitions, excluding master', async () => {
    const { sdk, changeKeys } = fixture();
    changeKeys(
      [0, 1, 2].map((securityLevel, keyId) => ({
        keyId,
        purpose: 0,
        securityLevel: securityLevel as 0 | 1 | 2,
        keyType: 0,
        data,
      })),
    );
    const signer = await createBackupSigner(sdk, {
      identityId: ID,
      keys: [0, 1, 2].map((id) => ({
        id,
        purpose: 'AUTHENTICATION',
        securityLevel: 'MASTER',
        privateKeyWif: wif,
      })),
    });
    const version = PlatformVersion.latest();
    const master = new IdentityPublicKey({
      keyId: 0,
      purpose: 0,
      securityLevel: 0,
      keyType: 0,
      data,
    });
    const contract = new DataContract({
      ownerId: ID,
      identityNonce: 1n,
      schemas: {
        note: {
          position: 0,
          type: 'object',
          properties: { message: { position: 0, type: 'string', maxLength: 100 } },
          additionalProperties: false,
        },
      },
      fullValidation: false,
      platformVersion: version,
    });
    try {
      for (const [id, Constructor, levels] of [
        ['contract.register', DataContractCreateTransition, ['CRITICAL', 'HIGH']],
        ['contract.update', DataContractUpdateTransition, ['CRITICAL']],
      ] as const) {
        const wrapper = new Constructor(contract, 1n, version);
        const transition = wrapper.toStateTransition();
        const material = await signer.prepareSdk!(operationRequirement(id).criteria);
        try {
          expect(transition.getKeyLevelRequirement(0)).toEqual(levels);
          expect(() => transition.verifyPublicKey(master)).toThrow();
          expect(material.identityKey.securityLevel).toBe('CRITICAL');
          expect(() => transition.verifyPublicKey(material.identityKey)).not.toThrow();
        } finally {
          material.release!();
          transition.free();
          wrapper.free();
        }
      }
    } finally {
      master.free();
      contract.free();
      version.free();
      signer.destroy();
    }
  });

  it('matches actual pinned SDK critical security requirements for credit transfer and withdrawal', async () => {
    const { sdk } = fixture({ purpose: 3, securityLevel: 1 });
    const signer = await createWifSigner(sdk, wif, ID);
    // rc2 JSON typings also omit the format tag and name identityId senderId.
    // Include both public aliases to exercise the real typed deserializer.
    const transferJson = {
      $formatVersion: '0',
      identityId: ID,
      senderId: ID,
      recipientId: ID,
      amount: 1,
      nonce: 1,
      userFeeIncrease: 0,
      signaturePublicKeyId: 0,
      signature: '',
    };
    const wrappers = [
      {
        id: 'identity.creditTransfer',
        // rc2 merges facade and transition option interfaces under the same
        // name. The typed JSON constructor avoids that upstream collision.
        wrapper: IdentityCreditTransfer.fromJSON(transferJson),
      },
      {
        id: 'identity.creditWithdrawal',
        wrapper: new IdentityCreditWithdrawalTransition({
          identityId: ID,
          amount: 1n,
          coreFeePerByte: 1,
          pooling: 'never',
          nonce: 1n,
        }),
      },
    ];
    try {
      for (const { id, wrapper } of wrappers) {
        const transition = wrapper.toStateTransition();
        const material = await signer.prepareSdk!(operationRequirement(id).criteria);
        try {
          expect(transition.getKeyLevelRequirement(3)).toEqual(['CRITICAL']);
          expect(() => transition.verifyPublicKey(material.identityKey)).not.toThrow();
        } finally {
          material.release!();
          transition.free();
        }
      }
    } finally {
      wrappers.forEach(({ wrapper }) => wrapper.free());
      signer.destroy();
    }
  });
});
