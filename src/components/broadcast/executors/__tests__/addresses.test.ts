import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformAddressSigner, PrivateKey, wallet } from '@dashevo/evo-sdk';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
import { prepareNewIdentityKeys } from '@/signer/new-identity';
import { BroadcastOutcomeUnknownError, OperationNotSubmittedError } from '../../outcomes';
import {
  executeAddressCreateIdentity,
  executeAddressFundFromAssetLock,
  executeAddressTopUpIdentity,
  executeAddressTransfer,
  executeAddressTransferFromIdentity,
  executeAddressWithdraw,
} from '../addresses';
import { parseAssetLockProof } from '../../forms/identity/asset-lock';

// The protocol version guard is unit-tested in protocol-version.test.ts.
const assertWritable = vi.hoisted(() => vi.fn());
vi.mock('@sdk/protocol-version', () => ({ assertWritableProtocolVersion: assertWritable }));
beforeEach(() => {
  assertWritable.mockReset().mockResolvedValue(14);
});

// Real WASM SDK for keys, scripts and proofs; only the network calls are mocked,
// shaped like the 5.0.0-rc.8 declarations. Nothing is broadcast.
const A = 'tdash1kp63uahgrxged4z5jswyt5dn5v3lzsem6cwarqfg'; // key 0x…01
const B = 'tdash1krjjyfzq5ecwfckja4al0f4d702th5r5pgrawfla';
const CORE = 'yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg6';
const IDENTITY = 'ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa';
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let wifA: string;
let wifOther: string;

/** The mnemonic's default keys with the hashes the form derives for review. */
async function mnemonicKeys() {
  const source = { kind: 'mnemonic' as const, mnemonic: MNEMONIC, identityIndex: 0 };
  const keys = await prepareNewIdentityKeys(source, 'testnet');
  keys.release();
  return { source, publicKeyHashes: keys.publicKeyHashes };
}

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  wifA = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet').toWIF();
  wifOther = PrivateKey.fromHex('0'.repeat(63) + '2', 'testnet').toWIF();
});

/** An SDK address info as the result maps hold it. */
const info = (address: string, balance: bigint, nonce = 1n) => ({
  address: { toBech32m: () => address, free: vi.fn() },
  balance,
  nonce,
  free: vi.fn(),
});

function mockSdk(balance = 10n ** 12n) {
  const identity = { free: vi.fn() };
  return {
    addresses: {
      get: vi.fn().mockResolvedValue({ balance, free: vi.fn() }),
      transfer: vi.fn().mockResolvedValue(
        new Map([
          ['a', info(A, 5n)],
          ['b', info(B, 6n)],
        ]),
      ),
      topUpIdentity: vi.fn().mockResolvedValue({
        addressInfos: new Map([['a', info(A, 5n)]]),
        newBalance: 77n,
        free: vi.fn(),
      }),
      withdraw: vi.fn().mockResolvedValue(new Map([['a', info(A, 5n)]])),
      transferFromIdentity: vi.fn().mockResolvedValue({
        addressInfos: new Map([['b', info(B, 9n)]]),
        newBalance: 88n,
        free: vi.fn(),
      }),
      fundFromAssetLock: vi.fn().mockResolvedValue(new Map([['b', info(B, 9n)]])),
      createIdentity: vi.fn(),
    },
    identities: {
      fetch: vi.fn().mockResolvedValue(identity),
      byPublicKeyHash: vi.fn().mockResolvedValue(undefined),
    },
    identity,
  };
}

const transferOptions = () => ({
  network: 'testnet' as const,
  inputKeyWif: wifA,
  fromAddress: A,
  outputs: [{ address: B, amountCredits: 50_000_000n }],
  feeFrom: 'sender' as const,
});

describe('Platform address executors', () => {
  it('transfers with plain SDK inputs, the reviewed total, and frees the address signer', async () => {
    const sdk = mockSdk();
    // The executor frees WASM objects once the call settles: read them during it.
    let signerHadKey = false;
    sdk.addresses.transfer.mockImplementation(async ({ signer }) => {
      signerHadKey = signer instanceof PlatformAddressSigner && signer.hasKey(A);
      return new Map([
        ['a', info(A, 5n)],
        ['b', info(B, 6n)],
      ]);
    });
    const free = vi.spyOn(PlatformAddressSigner.prototype, 'free');
    const assertCurrent = vi.fn();
    try {
      const result = await executeAddressTransfer({
        sdk: sdk as never,
        signer: null,
        options: transferOptions(),
        assertCurrent,
      });
      const call = sdk.addresses.transfer.mock.calls[0]![0];
      expect(call.inputs).toEqual([{ address: A, amount: 50_000_000n }]);
      expect(call.outputs).toEqual([{ address: B, amount: 50_000_000n }]);
      expect(call.feeStrategy).toEqual([{ $type: 'deductFromInput', index: 0 }]);
      expect(signerHadKey).toBe(true);
      expect(assertCurrent).toHaveBeenCalledOnce();
      expect(free).toHaveBeenCalled();
      expect(result).toMatchObject({
        kind: 'addresses',
        addresses: [A, B],
        balances: { [A]: { balance: '5', nonce: '1' }, [B]: { balance: '6', nonce: '1' } },
      });
    } finally {
      free.mockRestore();
    }
  });

  it('lets a single recipient pay the fee only when it receives enough to cover it', async () => {
    const sdk = mockSdk();
    await executeAddressTransfer({
      sdk: sdk as never,
      signer: null,
      options: { ...transferOptions(), feeFrom: 'recipient' },
    });
    expect(sdk.addresses.transfer.mock.calls[0]![0].feeStrategy).toEqual([
      { $type: 'reduceOutput', index: 0 },
    ]);
    const small = executeAddressTransfer({
      sdk: sdk as never,
      signer: null,
      options: {
        ...transferOptions(),
        feeFrom: 'recipient',
        outputs: [{ address: B, amountCredits: 1_000_000n }],
      },
    });
    await expect(small).rejects.toBeInstanceOf(OperationNotSubmittedError);
    await expect(small).rejects.toThrow(/at least 6,500,000/);
  });

  it.each([
    ['a key for another address', { inputKeyWif: '' }, /reviewed sending address/],
    ['an underfunded address', {}, /plus a fee of at least 6,500,000/],
    [
      'a recipient that is the sender',
      { outputs: [{ address: A, amountCredits: 600_000n }] },
      /sending address/,
    ],
  ])('refuses %s before submitting', async (_, patch, message) => {
    const sdk = mockSdk(50_000_001n);
    const options = { ...transferOptions(), ...patch };
    if ('inputKeyWif' in patch) options.inputKeyWif = wifOther;
    const error = await executeAddressTransfer({ sdk: sdk as never, signer: null, options }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(message);
    expect(sdk.addresses.transfer).not.toHaveBeenCalled();
  });

  it('checks the network protocol version before building, as not submitted', async () => {
    const sdk = mockSdk();
    assertWritable.mockRejectedValue(new Error('This network runs Platform protocol v15'));
    const error = await executeAddressTransfer({
      sdk: sdk as never,
      signer: null,
      options: transferOptions(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect(assertWritable).toHaveBeenCalledWith(sdk);
    expect(sdk.addresses.get).not.toHaveBeenCalled();
  });

  it('keeps a failed write "outcome unknown" with the addresses it touched', async () => {
    const sdk = mockSdk();
    sdk.addresses.transfer.mockRejectedValue({ name: 'TimeoutReached', message: 'timeout' });
    const error = await executeAddressTransfer({
      sdk: sdk as never,
      signer: null,
      options: transferOptions(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect((error as BroadcastOutcomeUnknownError).entities).toEqual({ addresses: [A, B] });

    sdk.addresses.transfer.mockRejectedValue({ name: 'InvalidArgument', message: 'bad input' });
    await expect(
      executeAddressTransfer({ sdk: sdk as never, signer: null, options: transferOptions() }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
  });

  it('funds addresses from the identity with the reviewed transfer key', async () => {
    const sdk = mockSdk();
    const prepareSdk = vi.fn().mockResolvedValue(createSigningMaterial({ keyId: 3 }));
    const result = await executeAddressTransferFromIdentity({
      sdk: sdk as never,
      signer: createMockSigner({ prepareSdk }),
      signingKeyId: 3,
      options: { network: 'testnet', outputs: [{ address: B, amountCredits: 700_000n }] },
    });
    expect(prepareSdk).toHaveBeenCalledWith({
      purpose: 'TRANSFER',
      allowedSecurityLevels: ['CRITICAL'],
      keyId: 3,
    });
    const call = sdk.addresses.transferFromIdentity.mock.calls[0]![0];
    expect(call).toMatchObject({
      identity: sdk.identity,
      outputs: [{ address: B, amount: 700_000n }],
      signingTransferKeyId: 3,
    });
    expect(result).toMatchObject({ identityId: 'identity-1', newBalance: '88', addresses: [B] });
  });

  it('tops up an identity from an address', async () => {
    const sdk = mockSdk();
    const result = await executeAddressTopUpIdentity({
      sdk: sdk as never,
      signer: null,
      options: {
        network: 'testnet',
        identityId: IDENTITY,
        inputKeyWif: wifA,
        fromAddress: A,
        amountCredits: 10_000_000n,
      },
    });
    expect(sdk.identities.fetch).toHaveBeenCalledWith(IDENTITY);
    expect(sdk.addresses.topUpIdentity.mock.calls[0]![0]).toMatchObject({
      identity: sdk.identity,
      inputs: [{ address: A, amount: 10_000_000n }],
    });
    expect(result).toMatchObject({ identityId: IDENTITY, newBalance: '77' });
  });

  it('withdraws to the Core address script with pooling "never"', async () => {
    const sdk = mockSdk();
    let script = '';
    sdk.addresses.withdraw.mockImplementation(async ({ outputScript }) => {
      script = outputScript.toHex();
      return new Map();
    });
    await executeAddressWithdraw({
      sdk: sdk as never,
      signer: null,
      options: {
        network: 'testnet',
        inputKeyWif: wifA,
        fromAddress: A,
        amountCredits: 2_000_000n,
        toAddress: CORE,
        coreFeePerByte: 1,
        protocolVersion: 14,
      },
    });
    const call = sdk.addresses.withdraw.mock.calls[0]![0];
    expect(script).toBe('76a914751e76e8199196d454941c45d1b3a323f1433bd688ac');
    expect(call).toMatchObject({
      inputs: [{ address: A, amount: 2_000_000n }],
      coreFeePerByte: 1,
      pooling: 0,
      feeStrategy: [{ $type: 'deductFromInput', index: 0 }],
    });
  });

  it.each([
    [{ amountCredits: 1_189_999n }, /Withdrawals must be 1,190,000/],
    [{ coreFeePerByte: 4 }, /Fibonacci/],
    [{ toAddress: 'XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE' }, /not a valid testnet Dash address/],
  ])('refuses withdrawal input %# before submitting', async (patch, message) => {
    const sdk = mockSdk();
    const error = await executeAddressWithdraw({
      sdk: sdk as never,
      signer: null,
      options: {
        network: 'testnet',
        inputKeyWif: wifA,
        fromAddress: A,
        amountCredits: 2_000_000n,
        toAddress: CORE,
        coreFeePerByte: 1,
        protocolVersion: 14,
        ...patch,
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(message);
    expect(sdk.addresses.withdraw).not.toHaveBeenCalled();
  });

  it('funds an address from an asset lock with one remainder output that pays the fee', async () => {
    const sdk = mockSdk();
    const proof = await parseAssetLockProof({
      kind: 'chain',
      txid: 'a7383eb8e75f425b1da0b67ee735d612a652de1bad5c76d54f972f30b8ff3422',
      outputIndex: '0',
      coreChainLockedHeight: '1579591',
    });
    let seen: Record<string, unknown> = {};
    sdk.addresses.fundFromAssetLock.mockImplementation(async (o) => {
      seen = {
        proof: o.assetLockProof.toHex(),
        keyHash: o.assetLockPrivateKey.getPublicKeyHash(),
        outputs: o.outputs,
        feeStrategy: o.feeStrategy,
        signerKeys: o.signer.keyCount,
      };
      return new Map([['b', info(B, 9n)]]);
    });
    await executeAddressFundFromAssetLock({
      sdk: sdk as never,
      signer: null,
      options: { network: 'testnet', address: B, proof, assetLockKeyWif: wifA },
    });
    expect(seen).toEqual({
      proof: proof.proofHex,
      keyHash: '751e76e8199196d454941c45d1b3a323f1433bd6',
      outputs: [{ address: B }],
      feeStrategy: [{ $type: 'reduceOutput', index: 0 }],
      signerKeys: 0,
    });
  });

  it('creates an identity from address credits with keys no identity uses yet', async () => {
    const sdk = mockSdk();
    const created = {
      id: { toBase58: () => 'new-identity', free: vi.fn() },
      balance: 99n,
      free: vi.fn(),
    };
    let seen: Record<string, unknown> = {};
    sdk.addresses.createIdentity.mockImplementation(async (o) => {
      seen = {
        inputs: o.inputs,
        identityKeys: o.identity.publicKeys.length,
        identitySignerKeys: o.identitySigner.keyCount,
        addressSignerHasA: o.addressSigner.hasKey(A),
      };
      return { identity: created, addressInfos: new Map([['a', info(A, 1n, 3n)]]), free: vi.fn() };
    });
    const options = {
      network: 'testnet' as const,
      inputKeyWif: wifA,
      fromAddress: A,
      amountCredits: 100_000_000n,
      keys: await mnemonicKeys(),
    };
    const result = await executeAddressCreateIdentity({ sdk: sdk as never, signer: null, options });
    expect(seen).toEqual({
      inputs: [{ address: A, amount: 100_000_000n }],
      identityKeys: 4,
      identitySignerKeys: 4,
      addressSignerHasA: true,
    });
    expect(sdk.identities.byPublicKeyHash).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ identityId: 'new-identity', newBalance: '99' });

    sdk.identities.byPublicKeyHash.mockResolvedValueOnce({
      id: { toBase58: () => 'taken', free: vi.fn() },
      free: vi.fn(),
    });
    sdk.addresses.createIdentity.mockClear();
    const error = await executeAddressCreateIdentity({
      sdk: sdk as never,
      signer: null,
      options,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(/already a key of identity taken/);
    expect(sdk.addresses.createIdentity).not.toHaveBeenCalled();

    // Keys that no longer derive to the reviewed hashes are never signed.
    const changed = {
      ...options,
      keys: {
        ...options.keys,
        publicKeyHashes: ['00'.repeat(20), ...options.keys.publicKeyHashes.slice(1)],
      },
    };
    await expect(
      executeAddressCreateIdentity({ sdk: sdk as never, signer: null, options: changed }),
    ).rejects.toThrow(/no longer match the reviewed key hashes/);
    expect(sdk.addresses.createIdentity).not.toHaveBeenCalled();
  });
});
