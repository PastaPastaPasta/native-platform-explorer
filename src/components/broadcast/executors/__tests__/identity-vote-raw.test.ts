import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity, IdentityPublicKey, PrivateKey, wallet } from '@dashevo/evo-sdk';
import { BroadcastOutcomeUnknownError, OperationNotSubmittedError } from '../../outcomes';
import { parseAssetLockProof, type ParsedAssetLockProof } from '../../forms/identity/asset-lock';
import { decodeStateTransition } from '../../forms/raw/decode';
import { executeIdentityCreate, executeIdentityTopUp } from '../identity-create';
import { prepareNewIdentityKeys, type NewIdentityKeyChoice } from '@/signer/new-identity';
import { executeMasternodeVote, voterIdentityId } from '../voting';
import { executeRawBroadcast } from '../raw';

// The protocol version guard is unit-tested in protocol-version.test.ts.
const assertWritable = vi.hoisted(() => vi.fn());
vi.mock('@sdk/protocol-version', () => ({ assertWritableProtocolVersion: assertWritable }));
beforeEach(() => {
  assertWritable.mockReset().mockResolvedValue(14);
});

// Real WASM SDK; only network calls are mocked. Nothing is broadcast.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Not a palindrome: a byte-order mistake changes the voter identity.
const PRO_TX_HASH = '0123456789abcdef'.repeat(4);
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const SIGNED_HEX =
  '07007199f1f68404c86ecf60d9cb93ac2bdd02c0109cdbfeb759142b8ab9135f4b198bf296f9b006c8743b45ecb55d0e253f39d1c23e8865724f865dc3f7d5804b09fc000f424007000341202733b5fde2725f9d7b49618bc475aafb2d844d695793bfecbfbd44dcd672ef66542a44d2e3855f9ae3fa332cbaf9ea7d4227862db14db9df1028117e22a70786';
let wif: string;
let proof: ParsedAssetLockProof;
let keys: NewIdentityKeyChoice;

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  wif = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet').toWIF();
  proof = await parseAssetLockProof({
    kind: 'chain',
    txid: 'a7383eb8e75f425b1da0b67ee735d612a652de1bad5c76d54f972f30b8ff3422',
    outputIndex: '0',
    coreChainLockedHeight: '1579591',
  });
  const source = { kind: 'mnemonic' as const, mnemonic: MNEMONIC, identityIndex: 0 };
  const prepared = await prepareNewIdentityKeys(source, 'testnet');
  prepared.release();
  keys = { source, publicKeyHashes: prepared.publicKeyHashes };
});

describe('asset-lock identity executors', () => {
  const sdkFor = () => ({
    identities: {
      fetch: vi.fn().mockResolvedValue(undefined),
      byPublicKeyHash: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      topUp: vi.fn().mockResolvedValue(123n),
    },
  });
  const createOptions = () => ({
    network: 'testnet' as const,
    proof,
    assetLockKeyWif: wif,
    keys,
  });

  it('creates the identity the proof determines, with the derived keys', async () => {
    const sdk = sdkFor();
    let seen: Record<string, unknown> = {};
    sdk.identities.create.mockImplementation(async (o) => {
      seen = {
        id: o.identity.id.toBase58(),
        keys: o.identity.publicKeys.map((k: IdentityPublicKey) => k.keyId),
        signerKeys: o.signer.keyCount,
        proof: o.assetLockProof.toHex(),
        assetLockKey: o.assetLockPrivateKey.getPublicKeyHash(),
      };
    });
    const result = await executeIdentityCreate({
      sdk: sdk as never,
      signer: null,
      options: createOptions(),
    });
    expect(seen).toEqual({
      id: proof.identityId,
      keys: [0, 1, 2, 3],
      signerKeys: 4,
      proof: proof.proofHex,
      assetLockKey: '751e76e8199196d454941c45d1b3a323f1433bd6',
    });
    expect(result).toMatchObject({ kind: 'identity', identityId: proof.identityId });
  });

  it.each([
    [
      'the asset lock already funded an identity',
      (sdk: ReturnType<typeof sdkFor>) => sdk.identities.fetch.mockResolvedValue({ free: vi.fn() }),
      /already created identity/,
    ],
    [
      'a new key belongs to another identity',
      (sdk: ReturnType<typeof sdkFor>) =>
        sdk.identities.byPublicKeyHash.mockResolvedValueOnce({
          id: { toBase58: () => 'X', free: vi.fn() },
          free: vi.fn(),
        }),
      /already a key of identity X/,
    ],
  ])('refuses when %s', async (_, arrange, message) => {
    const sdk = sdkFor();
    arrange(sdk);
    const error = await executeIdentityCreate({
      sdk: sdk as never,
      signer: null,
      options: createOptions(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(message);
    expect(sdk.identities.create).not.toHaveBeenCalled();
  });

  it('refuses a proof that no longer matches the reviewed identity', async () => {
    const sdk = sdkFor();
    const options = { ...createOptions(), proof: { ...proof, identityId: 'reviewed-other' } };
    await expect(
      executeIdentityCreate({ sdk: sdk as never, signer: null, options }),
    ).rejects.toThrow(/no longer matches/);
    expect(sdk.identities.create).not.toHaveBeenCalled();
  });

  it('tops up an existing identity and reports the new balance', async () => {
    const sdk = sdkFor();
    const identity = { free: vi.fn() };
    sdk.identities.fetch.mockResolvedValue(identity);
    const result = await executeIdentityTopUp({
      sdk: sdk as never,
      signer: null,
      options: { network: 'testnet', identityId: proof.identityId, proof, assetLockKeyWif: wif },
    });
    expect(sdk.identities.topUp.mock.calls[0]![0].identity).toBe(identity);
    expect(result).toMatchObject({ identityId: proof.identityId, newBalance: '123' });
    sdk.identities.topUp.mockRejectedValue({ name: 'DapiClientError', message: 'reset' });
    await expect(
      executeIdentityTopUp({
        sdk: sdk as never,
        signer: null,
        options: { network: 'testnet', identityId: proof.identityId, proof, assetLockKeyWif: wif },
      }),
    ).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
  });
});

describe('masternode votes', () => {
  const votingKeyHash = '751e76e8199196d454941c45d1b3a323f1433bd6';

  it('derives the voter identity as SHA-256(proTxHash ‖ voting key hash)', async () => {
    const expected = createHash('sha256')
      .update(Buffer.from(PRO_TX_HASH, 'hex'))
      .update(Buffer.from(votingKeyHash, 'hex'))
      .digest();
    const id = await voterIdentityId(
      Buffer.from(PRO_TX_HASH, 'hex'),
      Buffer.from(votingKeyHash, 'hex'),
    );
    expect(
      Buffer.from((await import('@dashevo/evo-sdk')).Identifier.fromBase58(id).toBytes()),
    ).toEqual(expected);
  });

  async function voter(data = votingKeyHash) {
    const id = await voterIdentityId(
      Buffer.from(PRO_TX_HASH, 'hex'),
      Buffer.from(votingKeyHash, 'hex'),
    );
    const identity = new Identity(id);
    identity.addPublicKey(
      new IdentityPublicKey({
        keyId: 7,
        purpose: 'voting',
        securityLevel: 'high',
        keyType: 'ecdsa_hash160',
        isReadOnly: true,
        data: Buffer.from(data, 'hex'),
      }),
    );
    return { id, identity };
  }
  const options = () => ({
    network: 'testnet' as const,
    proTxHash: PRO_TX_HASH,
    votingKeyWif: wif,
    contractId: CONTRACT,
    documentTypeName: 'domain',
    indexName: 'parentNameAndLabel',
    indexValues: ['dash', 'abc'],
    choice: 'towardsIdentity' as const,
    towardsIdentityId: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
  });

  it("signs with the voter identity's own voting key", async () => {
    const { id, identity } = await voter();
    let seen: Record<string, unknown> = {};
    const sdk = {
      identities: { fetch: vi.fn().mockResolvedValue(identity) },
      voting: {
        masternodeVote: vi.fn(async (o) => {
          seen = {
            proTxHash: o.masternodeProTxHash,
            keyId: o.votingKey.keyId,
            poll: o.votePoll.toJSON(),
            choice: o.voteChoice.voteType,
            towards: o.voteChoice.value?.toBase58(),
            signerKeys: o.signer.keyCount,
          };
          return { toJSON: () => ({ recorded: true }), free: vi.fn() };
        }),
      },
    };
    const result = await executeMasternodeVote({
      sdk: sdk as never,
      signer: null,
      options: options(),
    });
    expect(sdk.identities.fetch).toHaveBeenCalledWith(id);
    expect(seen).toEqual({
      proTxHash: PRO_TX_HASH,
      keyId: 7,
      poll: {
        $type: 'contestedDocumentResourceVotePoll',
        contractId: CONTRACT,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'abc'],
      },
      choice: 'TowardsIdentity',
      towards: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
      signerKeys: 1,
    });
    expect(result).toEqual({
      kind: 'vote',
      message: expect.stringContaining(id),
      identityId: id,
      vote: { recorded: true },
    });
  });

  it.each([
    ['no voter identity exists', async () => undefined, /No masternode voter identity/],
    [
      'the voter has no matching key',
      async () => (await voter('00'.repeat(20))).identity,
      /no enabled voting key/,
    ],
  ])('refuses before signing when %s', async (_, fetch, message) => {
    const sdk = { identities: { fetch: vi.fn(fetch) }, voting: { masternodeVote: vi.fn() } };
    const error = await executeMasternodeVote({
      sdk: sdk as never,
      signer: null,
      options: options(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotSubmittedError);
    expect((error as Error).message).toMatch(message);
    expect(sdk.voting.masternodeVote).not.toHaveBeenCalled();
  });
});

describe('raw broadcast', () => {
  async function run(sdk: unknown, transitionPatch: object = {}) {
    const transition = { ...(await decodeStateTransition(SIGNED_HEX)), ...transitionPatch };
    return executeRawBroadcast({
      sdk: sdk as never,
      signer: null,
      options: { network: 'testnet', transition },
    });
  }
  const proved = { toJSON: () => ({ proved: true }) };
  const sdkWith = (broadcast: () => Promise<void>, wait: () => Promise<unknown>) => ({
    stateTransitions: {
      broadcastStateTransition: vi.fn(broadcast),
      waitForResponse: vi.fn(wait),
      waitForAffectedState: vi.fn().mockResolvedValue(proved),
    },
  });

  it('broadcasts the reviewed bytes and links the locally computed hash', async () => {
    const sdk = sdkWith(
      async () => undefined,
      async () => proved,
    );
    const result = await run(sdk);
    expect(sdk.stateTransitions.broadcastStateTransition).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'raw',
      stateTransitionHash: 'ea089b7d50ec73f1a44d53d62f85e63225edd2ea061521c27f8fa7902ea8e432',
      identityId: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
      broadcast: 'accepted',
      proof: 'execution',
      result: { proved: true },
    });
  });

  it('treats "already in mempool/chain" as already submitted and accepts affected-state proofs', async () => {
    const sdk = sdkWith(
      () => Promise.reject({ name: 'AlreadyExists', message: 'state transition already in chain' }),
      () => Promise.reject({ name: 'ExecutionNotProved', message: 'snapshot only' }),
    );
    const result = await run(sdk);
    expect(result).toMatchObject({ broadcast: 'already-known', proof: 'affected-state' });
    expect(sdk.stateTransitions.waitForAffectedState).toHaveBeenCalledOnce();
  });

  it('keeps other failures after broadcast "outcome unknown"', async () => {
    const sdk = sdkWith(
      () => Promise.reject({ name: 'TimeoutReached', message: 'timeout' }),
      async () => proved,
    );
    const error = await run(sdk).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect((error as BroadcastOutcomeUnknownError).entities).toEqual({
      identityId: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
    });
    // An ordinary Error claiming the name is not the SDK's duplicate signal.
    const spoofed = sdkWith(
      () => Promise.reject(Object.assign(new Error('dup'), { name: 'AlreadyExists' })),
      async () => proved,
    );
    await expect(run(spoofed)).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect(spoofed.stateTransitions.waitForResponse).not.toHaveBeenCalled();
  });

  it('never reports a wait failure after an accepted broadcast as "not submitted"', async () => {
    const sdk = sdkWith(
      async () => undefined,
      () => Promise.reject({ name: 'InvalidArgument', message: 'contract unavailable' }),
    );
    await expect(run(sdk)).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
  });

  it('refuses, as not submitted, reviewed bytes that no longer decode', async () => {
    const sdk = sdkWith(
      async () => undefined,
      async () => proved,
    );
    await expect(run(sdk, { hex: '00ff' })).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(sdk.stateTransitions.broadcastStateTransition).not.toHaveBeenCalled();
  });
});
