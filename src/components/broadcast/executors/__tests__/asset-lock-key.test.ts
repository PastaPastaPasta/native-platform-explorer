import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetLockProof, PrivateKey, wallet } from '@dashevo/evo-sdk';
import { OperationNotSubmittedError } from '../../outcomes';
import { assertAssetLockKey, assetLockCreditScripts, p2pkhKeyHash } from '../asset-lock-key';
import { executeIdentityCreate, executeIdentityTopUp } from '../identity-create';
import { executeAddressFundFromAssetLock } from '../addresses';
import {
  KEY_1_HASH,
  KEY_2_HASH,
  assetLockTx,
  chainProof,
  insightServing,
  instantProof,
  p2pkh,
} from './asset-lock-fixture';

const assertWritable = vi.hoisted(() => vi.fn());
vi.mock('@sdk/protocol-version', () => ({ assertWritableProtocolVersion: assertWritable }));
beforeEach(() => {
  assertWritable.mockReset().mockResolvedValue(14);
});

// Real WASM SDK; Insight and Platform are mocked. Nothing is broadcast.
let key1: PrivateKey;
let wif1: string;
let wif2: string;
beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  key1 = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet');
  wif1 = key1.toWIF();
  wif2 = PrivateKey.fromHex('0'.repeat(63) + '2', 'testnet').toWIF();
});

const tx = assetLockTx([p2pkh(KEY_2_HASH), p2pkh(KEY_1_HASH)]);
const load = (proofHex: string) => AssetLockProof.fromHex(proofHex);

describe('asset-lock transaction parsing', () => {
  it('reads the payload credit outputs, not the burn output', () => {
    expect(assetLockCreditScripts(tx).map(p2pkhKeyHash)).toEqual([KEY_2_HASH, KEY_1_HASH]);
  });

  it('refuses other transaction types and truncated bytes', () => {
    expect(() => assetLockCreditScripts(assetLockTx([p2pkh(KEY_1_HASH)], 0))).toThrow(/not an asset-lock transaction/);
    expect(() => assetLockCreditScripts(tx.subarray(0, tx.length - 3))).toThrow(/truncated/);
    expect(p2pkhKeyHash(Buffer.from(`a914${KEY_1_HASH}87`, 'hex'))).toBeNull();
  });
});

describe('assertAssetLockKey', () => {
  it('accepts the key an InstantSend proof\'s credit output pays, and only that one', async () => {
    const fetchImpl = vi.fn();
    const proof = load((await instantProof(tx, 1)).proofHex);
    await expect(assertAssetLockKey(proof, key1, 'testnet', fetchImpl)).resolves.toBeUndefined();
    const other = load((await instantProof(tx, 0)).proofHex);
    await expect(assertAssetLockKey(other, key1, 'testnet', fetchImpl)).rejects.toThrow(/does not control the asset-lock output/);
    // The transaction is in the proof: nothing is fetched.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a non-P2PKH credit output', async () => {
    const p2sh = load((await instantProof(assetLockTx([Buffer.from(`a914${KEY_1_HASH}87`, 'hex')]), 0)).proofHex);
    await expect(assertAssetLockKey(p2sh, key1, 'testnet')).rejects.toThrow(/not a pay-to-public-key-hash/);
  });

  it('checks a chain-lock proof against the transaction Insight serves for its txid', async () => {
    const proof = load((await chainProof(tx, 1)).proofHex);
    const fetchImpl = vi.fn(insightServing(tx));
    await expect(assertAssetLockKey(proof, key1, 'testnet', fetchImpl as never)).resolves.toBeUndefined();
    expect(String(fetchImpl.mock.calls[0]![0])).toMatch(/^https:\/\/insight\.testnet\.networks\.dash\.org\/insight-api\/rawtx\/[0-9a-f]{64}$/);
    const wrongOutput = load((await chainProof(tx, 0)).proofHex);
    await expect(assertAssetLockKey(wrongOutput, key1, 'testnet', fetchImpl as never)).rejects.toThrow(/does not control/);
    const outOfRange = load((await chainProof(tx, 5)).proofHex);
    await expect(assertAssetLockKey(outOfRange, key1, 'testnet', fetchImpl as never)).rejects.toThrow(/no credit output 5/);
  });

  it('refuses a chain-lock proof when Insight is missing, down, or serves another transaction', async () => {
    const proof = load((await chainProof(tx, 1)).proofHex);
    const impostor = assetLockTx([p2pkh(KEY_1_HASH), p2pkh(KEY_1_HASH)]);
    const lying = vi.fn(async () => new Response(JSON.stringify({ rawtx: Buffer.from(impostor).toString('hex') })));
    await expect(assertAssetLockKey(proof, key1, 'testnet', lying as never)).rejects.toThrow(/does not hash to/);
    const down = vi.fn(async () => new Response('', { status: 503 }));
    await expect(assertAssetLockKey(proof, key1, 'testnet', down as never)).rejects.toThrow(/Could not fetch .* \(HTTP 503\)/);
    await expect(assertAssetLockKey(proof, key1, 'devnet-unknown-without-insight', down as never)).rejects.toThrow(/Could not fetch/);
    await expect(assertAssetLockKey(proof, key1, 'devnet-paloma', down as never)).rejects.toThrow(/no Insight API/);
    expect(down).toHaveBeenCalledTimes(2);
  });
});

describe('asset-lock writes refuse a key that does not control the output, before submission', () => {
  const sdkFor = () => ({
    identities: {
      fetch: vi.fn().mockResolvedValue(undefined),
      byPublicKeyHash: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      topUp: vi.fn().mockResolvedValue(1n),
    },
    addresses: { fundFromAssetLock: vi.fn() },
  });
  const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it.each(['identity create', 'identity top-up', 'address fund'] as const)('%s', async (operation) => {
    const proof = await instantProof(tx, 1);
    const run = (sdk: ReturnType<typeof sdkFor>, assetLockKeyWif: string) => {
      const args = { sdk: sdk as never, signer: null, network: 'testnet' };
      if (operation === 'identity create') {
        return import('@/signer/new-identity').then(async ({ prepareNewIdentityKeys }) => {
          const source = { kind: 'mnemonic' as const, mnemonic: MNEMONIC, identityIndex: 0 };
          const prepared = await prepareNewIdentityKeys(source, 'testnet');
          prepared.release();
          return executeIdentityCreate({ ...args, options: { network: 'testnet', proof, assetLockKeyWif, keys: { source, publicKeyHashes: prepared.publicKeyHashes } } });
        });
      }
      if (operation === 'identity top-up') {
        sdk.identities.fetch.mockResolvedValue({ free: vi.fn() });
        return executeIdentityTopUp({ ...args, options: { network: 'testnet', identityId: proof.identityId, proof, assetLockKeyWif } });
      }
      return executeAddressFundFromAssetLock({
        ...args,
        options: { network: 'testnet', address: 'tdash1krjjyfzq5ecwfckja4al0f4d702th5r5pgrawfla', proof, assetLockKeyWif },
      });
    };
    const write = (sdk: ReturnType<typeof sdkFor>) =>
      operation === 'identity create' ? sdk.identities.create : operation === 'identity top-up' ? sdk.identities.topUp : sdk.addresses.fundFromAssetLock;

    const refused = sdkFor();
    const error = await run(refused, wif2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(/does not control the asset-lock output/);
    expect(write(refused)).not.toHaveBeenCalled();

    const accepted = sdkFor();
    accepted.addresses.fundFromAssetLock.mockResolvedValue(new Map());
    await run(accepted, wif1).catch(() => undefined);
    expect(write(accepted)).toHaveBeenCalledOnce();
  });
});
