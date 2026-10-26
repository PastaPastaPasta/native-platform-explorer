import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
import { BroadcastOutcomeUnknownError, OperationNotSubmittedError } from '../../outcomes';
import { POST_WRITE_READ, executeTokenOperation } from '../tokens';
import type { TokenOperationOptions } from '../../tokens/options';
import {
  ACTION_ID,
  CONTRACT_ID,
  MAX_SUPPLY_ACTION,
  MEMBER,
  OWNER,
  TOKEN_ID,
  base,
  contractObject,
  tokenConfig,
} from '../../tokens/__tests__/fixtures';

// Shaped like the wasm-sdk 5.0.0-rc.8 declarations the executor uses.
vi.mock('@dashevo/evo-sdk', () => {
  const tagged = (type: string) => (...args: unknown[]) => ({ type, args });
  return {
    Identifier: { fromBase58: (base58: string) => ({ base58 }) },
    GroupStateTransitionInfoStatus: {
      proposer: (position: number) => ({ proposer: position }),
      otherSigner: (position: number, actionId: string) => ({ otherSigner: position, actionId }),
    },
    AuthorizedActionTakers: {
      NoOne: tagged('NoOne'),
      ContractOwner: tagged('ContractOwner'),
      MainGroup: tagged('MainGroup'),
      Identity: tagged('Identity'),
      Group: tagged('Group'),
    },
    TokenConfigurationChangeItem: new Proxy({}, { get: (_target, name) => tagged(String(name)) }),
    TokenTradeMode: { NotTradeable: tagged('NotTradeable') },
    TokenConfigurationLocalization: class {
      constructor(...args: unknown[]) {
        Object.assign(this, { args });
      }
    },
    TokenConfigurationConvention: class {
      constructor(...args: unknown[]) {
        Object.assign(this, { args });
      }
    },
    DistributionFunction: { FixedAmountDistribution: tagged('FixedAmount') },
    DistributionFixedAmount: class {
      constructor(readonly options: unknown) {}
    },
    RewardDistributionType: {
      BlockBasedDistribution: tagged('Block'),
      TimeBasedDistribution: tagged('Time'),
      EpochBasedDistribution: tagged('Epoch'),
    },
    TokenDistributionRecipient: {
      ContractOwner: tagged('ContractOwner'),
      Identity: tagged('Identity'),
      EvonodesByParticipation: tagged('Evonodes'),
    },
    TokenPerpetualDistribution: class {
      constructor(...args: unknown[]) {
        Object.assign(this, { args });
      }
    },
  };
});

// The protocol version guard is unit-tested in protocol-version.test.ts; here it
// passes unless a test makes it fail.
const assertWritable = vi.hoisted(() => vi.fn());
vi.mock('@sdk/protocol-version', () => ({ assertWritableProtocolVersion: assertWritable }));

interface SdkState {
  config?: Record<string, unknown>;
  paused?: boolean;
  price?: [string, string];
  balances?: Record<string, bigint>;
  frozen?: string[];
  credits?: bigint;
  after?: Record<string, bigint>;
  actions?: Record<'ACTIVE' | 'CLOSED', Array<[string, unknown, Map<string, bigint>]>>;
}

function mockSdk(state: SdkState = {}) {
  const balances: Record<string, bigint> = { [OWNER]: 1_000_000_000n, [MEMBER]: 500_000_000n, ...state.balances };
  const write = vi.fn().mockResolvedValue({ free: vi.fn() });
  const actions = state.actions ?? { ACTIVE: [], CLOSED: [] };
  // Every proved read is one block newer than the last.
  let height = 100;
  const sdk = {
    contracts: { fetch: vi.fn().mockResolvedValue(contractObject(state.config)) },
    identities: {
      balances: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, 10_000_000_000n]))),
      balance: vi.fn().mockResolvedValue(state.credits ?? 10_000_000_000n),
    },
    tokens: {
      calculateId: vi.fn().mockResolvedValue(TOKEN_ID),
      contractInfo: vi.fn().mockResolvedValue({ contractId: CONTRACT_ID, tokenContractPosition: 0 }),
      statuses: vi.fn().mockResolvedValue(new Map(state.paused === undefined ? [] : [[TOKEN_ID, { isPaused: state.paused }]])),
      totalSupplyWithProof: vi.fn().mockResolvedValue({
        data: { totalSupply: 1_500_000_000n },
        metadata: { height: 100, timeMs: 1_793_006_500_493 },
      }),
      directPurchasePrices: vi.fn().mockResolvedValue(
        new Map(state.price ? [[TOKEN_ID, { basePrice: state.price[0], currentPrice: state.price[1] }]] : []),
      ),
      balances: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => balances[id] !== undefined).map((id) => [id, balances[id]!]))),
      identitiesTokenInfos: vi.fn(async (ids: string[]) =>
        new Map(ids.filter((id) => state.frozen?.includes(id)).map((id) => [id, { isFrozen: true }])),
      ),
      balancesWithProof: vi.fn(async (ids: string[]) => ({
        data: new Map(ids.map((id) => [id, state.after?.[id] ?? balances[id] ?? 0n])),
        metadata: { height: 101 },
      })),
      mint: write,
      burn: write,
      transfer: write,
      freeze: write,
      unfreeze: write,
      destroyFrozen: write,
      emergencyAction: write,
      setPrice: write,
      directPurchase: write,
      claim: write,
      configUpdate: write,
    },
    group: {
      actions: vi.fn(async ({ status }: { status: 'ACTIVE' | 'CLOSED' }) => new Map(actions[status].map(([id, json]) => [id, { toJSON: () => json }]))),
      actionsWithProof: vi.fn(async ({ status }: { status: 'ACTIVE' | 'CLOSED' }) => ({
        data: new Map(actions[status].map(([id, json]) => [id, { toJSON: () => json }])),
        metadata: { height: (height += 1) },
      })),
      actionSigners: vi.fn(async ({ status, actionId }: { status: 'ACTIVE' | 'CLOSED'; actionId: string }) =>
        actions[status].find(([id]) => id === actionId)?.[2] ?? new Map(),
      ),
    },
  };
  return { sdk, write };
}

function signerFor(identityId = OWNER) {
  const prepareSdk = vi.fn().mockResolvedValue(
    createSigningMaterial({ identityId, keyId: 2, identityKey: { keyId: 2 } as never }),
  );
  return { signer: createMockSigner({ identityId, prepareSdk }), prepareSdk };
}

async function run(options: TokenOperationOptions, state?: SdkState, identityId = options.signerId) {
  const { sdk, write } = mockSdk(state);
  const { signer, prepareSdk } = signerFor(identityId);
  const result = executeTokenOperation({ sdk: sdk as never, signer, options, signingKeyId: 2 });
  return { result, sdk, write, prepareSdk };
}

beforeEach(() => {
  assertWritable.mockReset().mockResolvedValue(14);
  POST_WRITE_READ.attempts = 3;
  POST_WRITE_READ.delayMs = 0;
});

const identity = (base58: string) => ({ base58 });
const common = { dataContractId: identity(CONTRACT_ID), tokenPosition: 0, identityKey: { keyId: 2 } };

describe('token executors', () => {
  it.each<[string, TokenOperationOptions, SdkState, Record<string, unknown>]>([
    [
      'mint',
      { ...base, kind: 'mint', amount: 1_000_000_000n, recipientId: MEMBER, chooseRecipient: true, publicNote: 'hi' },
      { after: { [MEMBER]: 1_500_000_000n } },
      { amount: 1_000_000_000n, identityId: identity(OWNER), recipientId: identity(MEMBER), publicNote: 'hi', groupInfo: undefined },
    ],
    [
      'burn',
      { ...base, kind: 'burn', amount: 150_000_000n },
      { after: { [OWNER]: 850_000_000n } },
      { amount: 150_000_000n, identityId: identity(OWNER) },
    ],
    [
      'transfer',
      { ...base, kind: 'transfer', amount: 300_000_000n, recipientId: MEMBER },
      { after: { [OWNER]: 700_000_000n, [MEMBER]: 800_000_000n } },
      { amount: 300_000_000n, senderId: identity(OWNER), recipientId: identity(MEMBER) },
    ],
    ['freeze', { ...base, kind: 'freeze', targetIdentityId: MEMBER }, {}, { authorityId: identity(OWNER), frozenIdentityId: identity(MEMBER) }],
    ['unfreeze', { ...base, kind: 'unfreeze', targetIdentityId: MEMBER }, { frozen: [MEMBER] }, { authorityId: identity(OWNER), frozenIdentityId: identity(MEMBER) }],
    [
      'destroyFrozen',
      { ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 500_000_000n },
      { frozen: [MEMBER], after: { [MEMBER]: 0n } },
      { authorityId: identity(OWNER), frozenIdentityId: identity(MEMBER) },
    ],
    ['emergencyAction', { ...base, kind: 'emergencyAction', action: 'pause' }, {}, { authorityId: identity(OWNER), action: 'pause' }],
    [
      'setPrice',
      { ...base, kind: 'setPrice', schedule: { type: 'tiers', tiers: [{ minAmount: 100n, price: 2n }, { minAmount: 500n, price: 1n }] } },
      {},
      { authorityId: identity(OWNER), priceTiers: { '100': 2n, '500': 1n } },
    ],
    ['setPrice', { ...base, kind: 'setPrice', schedule: { type: 'none' } }, {}, { authorityId: identity(OWNER), price: null }],
    [
      'directPurchase',
      { ...base, kind: 'directPurchase', amount: 200_000_000n, maxTotalCost: 200_000_000n, reviewedPrice: { first: 1n, last: 1n } },
      { price: ['1', '1'], after: { [OWNER]: 1_200_000_000n } },
      { buyerId: identity(OWNER), amount: 200_000_000n, maxTotalCost: 200_000_000n },
    ],
    [
      'claim',
      { ...base, kind: 'claim', distributionType: 'perpetual' },
      { after: { [OWNER]: 1_100_000_000n } },
      { identityId: identity(OWNER), distributionType: 'perpetual' },
    ],
    [
      'configUpdate',
      { ...base, kind: 'configUpdate', change: { item: 'rule', rule: 'emergencyAction', target: 'authorized', takers: { type: 'noOne' } } },
      {},
      { identityId: identity(OWNER), configurationChangeItem: { type: 'EmergencyActionItem', args: [{ type: 'NoOne', args: [] }] } },
    ],
  ])('%s submits the reviewed inputs with the reviewed key', async (method, options, state, expected) => {
    const { result, sdk, prepareSdk } = await run(options, state);
    const value = await result;
    expect(prepareSdk).toHaveBeenCalledWith({
      purpose: method === 'transfer' || method === 'claim' ? ['AUTHENTICATION', 'TRANSFER'] : 'AUTHENTICATION',
      allowedSecurityLevels: ['CRITICAL'],
      target: { contractId: CONTRACT_ID },
      keyId: 2,
    });
    const call = (sdk.tokens as unknown as Record<string, { mock: { calls: unknown[][] } }>)[method]!.mock.calls[0]![0];
    expect(call).toMatchObject({ ...common, ...expected });
    expect(value).toMatchObject({ kind: 'token', action: options.kind, tokenId: TOKEN_ID, contractId: CONTRACT_ID });
  });

  it('reports proved balances before and after the write', async () => {
    const { result } = await run(
      { ...base, kind: 'transfer', amount: 300_000_000n, recipientId: MEMBER },
      { after: { [OWNER]: 700_000_000n, [MEMBER]: 800_000_000n } },
    );
    expect(await result).toMatchObject({
      balancesProvedAtHeight: '101',
      balances: [
        { identityId: OWNER, before: '1000000000', after: '700000000', display: '10 → 7 npetok' },
        { identityId: MEMBER, before: '500000000', after: '800000000', display: '5 → 8 npetok' },
      ],
    });
  });

  it('retries a post-write read that predates the write', async () => {
    const { sdk, write } = mockSdk();
    sdk.tokens.balancesWithProof
      .mockResolvedValueOnce({ data: new Map([[OWNER, 1_000_000_000n]]), metadata: { height: 100 } })
      .mockResolvedValueOnce({ data: new Map([[OWNER, 850_000_000n]]), metadata: { height: 102 } });
    const { signer } = signerFor();
    const value = await executeTokenOperation({ sdk: sdk as never, signer, options: { ...base, kind: 'burn', amount: 150_000_000n } });
    expect(write).toHaveBeenCalledOnce();
    expect(sdk.tokens.balancesWithProof).toHaveBeenCalledTimes(2);
    expect(value.balances?.[0]).toMatchObject({ after: '850000000' });
    expect(value.balancesError).toBeUndefined();
  });

  it('keeps a confirmed write successful when the balances cannot be re-read', async () => {
    const { sdk } = mockSdk();
    sdk.tokens.balancesWithProof.mockRejectedValue(new Error('node down'));
    const { signer } = signerFor();
    const value = await executeTokenOperation({ sdk: sdk as never, signer, options: { ...base, kind: 'burn', amount: 1n } });
    expect(value.balancesError).toMatch(/write was confirmed, but re-reading balances failed: node down/);
    expect(value.balances?.[0]).toEqual({ identityId: OWNER, before: '1000000000', display: '10 npetok before' });
  });

  it.each<[string, TokenOperationOptions, SdkState, RegExp]>([
    ['a paused token', { ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER }, { paused: true }, /paused/],
    ['changed decimals', { ...base, kind: 'burn', amount: 1n }, { config: tokenConfig({ conventions: { decimals: 2, localizations: { en: { singularForm: 'npetok' } } } }) }, /conventions changed/],
    ['an unauthorized signer', { ...base, kind: 'mint', amount: 1n, recipientId: OWNER, chooseRecipient: true }, { config: tokenConfig({ manualMintingRules: { authorizedToMakeChange: { $type: 'noOne' } } }) }, /No one may mint/],
    ['an exceeded max supply', { ...base, kind: 'mint', amount: 100_000_000_000_000n, recipientId: OWNER, chooseRecipient: true }, {}, /exceed the max supply/],
    ['an unfrozen target', { ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 500_000_000n }, {}, /is not frozen/],
    ['a changed frozen balance', { ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 1n }, { frozen: [MEMBER] }, /not the reviewed amount/],
    ['a changed price', { ...base, kind: 'directPurchase', amount: 2n, maxTotalCost: 2n, reviewedPrice: { first: 1n, last: 1n } }, { price: ['2', '2'] }, /price changed/],
    ['too few credits', { ...base, kind: 'directPurchase', amount: 2n, maxTotalCost: 2n, reviewedPrice: { first: 1n, last: 1n } }, { price: ['1', '1'], credits: 1n }, /less than the 2 agreed/],
    ['a group-governed change without a group action', { ...base, kind: 'configUpdate', change: { item: 'maxSupply', value: 2_000_000_000_000_000n } }, {}, /Group #0 must approve this/],
  ])('does not submit for %s', async (_name, options, state, message) => {
    const { result, write } = await run(options, state);
    await expect(result).rejects.toBeInstanceOf(OperationNotSubmittedError);
    await expect(result).rejects.toThrow(message);
    expect(write).not.toHaveBeenCalled();
  });

  it('does not submit when the network protocol cannot be confirmed', async () => {
    assertWritable.mockRejectedValue(new Error('Could not read the protocol version'));
    const { result, write } = await run({ ...base, kind: 'burn', amount: 1n });
    await expect(result).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses inputs built for another identity', async () => {
    const { result, write } = await run({ ...base, kind: 'burn', amount: 1n }, {}, MEMBER);
    await expect(result).rejects.toThrow(/built for another identity/);
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses a token ID that is not the reviewed contract position', async () => {
    const { sdk, write } = mockSdk();
    sdk.tokens.calculateId.mockResolvedValue('A'.repeat(44));
    const { signer } = signerFor();
    await expect(
      executeTokenOperation({ sdk: sdk as never, signer, options: { ...base, kind: 'burn', amount: 1n } }),
    ).rejects.toThrow(/is not position 0 of contract/);
    expect(write).not.toHaveBeenCalled();
  });

  it('classifies a failed write as outcome unknown', async () => {
    const { sdk, write } = mockSdk();
    write.mockRejectedValue(new Error('connection reset'));
    const { signer } = signerFor();
    const result = executeTokenOperation({ sdk: sdk as never, signer, options: { ...base, kind: 'burn', amount: 1n } });
    await expect(result).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
    await expect(result).rejects.toMatchObject({ entities: { identityId: OWNER, tokenId: TOKEN_ID, contractId: CONTRACT_ID } });
  });

  describe('group actions', () => {
    const propose: TokenOperationOptions = {
      ...base,
      kind: 'configUpdate',
      change: { item: 'maxSupply', value: 200_000_000_000_000n },
      group: { mode: 'propose', groupPosition: 0 },
    };

    it('proposes with the proposer group info', async () => {
      const { result, write } = await run(propose);
      const value = await result;
      expect(write.mock.calls[0]![0]).toMatchObject({
        groupInfo: { proposer: 0 },
        configurationChangeItem: { type: 'MaxSupplyItem', args: [200_000_000_000_000n] },
      });
      expect(value.group).toMatchObject({ mode: 'propose', groupPosition: 0, requiredPower: 2 });
    });

    /** The SDK cannot verify the write; afterwards the group shows `after` (ACTIVE). */
    function unverifiedProposal(after: Array<[string, unknown, Map<string, bigint>]>, page = 0, pageStatus = 'ACTIVE') {
      const { sdk, write } = mockSdk();
      write.mockRejectedValue({ name: 'DriveProofError', message: 'Expected document in group action result' });
      const filler: Array<[string, unknown]> = Array.from({ length: page }, (_, i) => [`filler-${i}`, { toJSON: () => ({ event: {} }) }]);
      let reads = 0;
      vi.mocked(sdk.group.actionsWithProof).mockImplementation(async ({ status }) => {
        reads += 1;
        const shown = reads > 2 && status === 'ACTIVE' ? after : [];
        return {
          data: new Map<string, { toJSON: () => unknown }>([
            ...(status === pageStatus ? (filler as Array<[string, { toJSON: () => unknown }]>) : []),
            ...shown.map(([id, json]): [string, { toJSON: () => unknown }] => [id, { toJSON: () => json }]),
          ]),
          metadata: { height: 100 + reads },
        };
      });
      sdk.group.actionSigners.mockImplementation(async ({ actionId }: { actionId: string }) => after.find(([id]) => id === actionId)?.[2] ?? new Map());
      return { sdk, write };
    }

    it('confirms a proposal the SDK could not verify by a proved read of the group', async () => {
      const { sdk } = unverifiedProposal([[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]]);
      const { signer } = signerFor();
      const value = await executeTokenOperation({ sdk: sdk as never, signer, options: propose });
      expect(value.group).toMatchObject({ actionId: ACTION_ID });
      expect(value.message).toMatch(/proved read of the group confirmed your signature/);
    });

    it('does not take another member’s proposal or a full page as confirmation', async () => {
      const theirs = { ...MAX_SUPPLY_ACTION, proposer_id: MEMBER };
      const { signer } = signerFor();
      const other = unverifiedProposal([[ACTION_ID, theirs, new Map([[MEMBER, 1n], [OWNER, 1n]])]]);
      await expect(executeTokenOperation({ sdk: other.sdk as never, signer, options: propose })).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
      // A full page may hide an identical pending proposal: refuse before signing.
      const full = unverifiedProposal([[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], 100);
      await expect(executeTokenOperation({ sdk: full.sdk as never, signer, options: propose })).rejects.toThrow(/too many actions/);
      expect(full.write).not.toHaveBeenCalled();
    });

    it('still proposes when only the closed actions fill a page, leaving the outcome unknown', async () => {
      const { signer } = signerFor();
      const closed = unverifiedProposal([[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], 100, 'CLOSED');
      await expect(executeTokenOperation({ sdk: closed.sdk as never, signer, options: propose })).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
      expect(closed.write).toHaveBeenCalledOnce();
    });

    it('keeps reading when a newer proof does not show the write yet', async () => {
      const { sdk } = unverifiedProposal([[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]]);
      const original = sdk.group.actionsWithProof.getMockImplementation()!;
      let reads = 0;
      // The first post-write pair is newer but empty, as from a node one block behind the write.
      sdk.group.actionsWithProof.mockImplementation(async (query: { status: 'ACTIVE' | 'CLOSED' }) => {
        reads += 1;
        const response = await original(query);
        return reads === 3 || reads === 4 ? { ...response, data: new Map() } : response;
      });
      const { signer } = signerFor();
      const value = await executeTokenOperation({ sdk: sdk as never, signer, options: propose });
      expect(value.group).toMatchObject({ actionId: ACTION_ID });
    });

    it('refuses to propose an action the signer already has pending', async () => {
      const { result, write } = await run(propose, {
        actions: { ACTIVE: [[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], CLOSED: [] },
      });
      await expect(result).rejects.toBeInstanceOf(OperationNotSubmittedError);
      await expect(result).rejects.toThrow(/already proposed this exact action/);
      expect(write).not.toHaveBeenCalled();
    });

    it('says when the proposer alone completes the action', async () => {
      const strong = contractObject();
      const json = strong.toJSON() as { groups: Record<number, { members: Record<string, number> }> };
      json.groups[0]!.members[OWNER] = 2;
      const { sdk } = mockSdk();
      sdk.contracts.fetch.mockResolvedValue(strong);
      const { signer } = signerFor();
      const value = await executeTokenOperation({ sdk: sdk as never, signer, options: propose });
      expect(value.message).toMatch(/reached the required power, so the action executed/);
    });

    it('leaves an unconfirmed group write unknown', async () => {
      const { sdk, write } = mockSdk();
      write.mockRejectedValue({ name: 'DriveProofError', message: 'Expected document in group action result' });
      const { signer } = signerFor();
      await expect(executeTokenOperation({ sdk: sdk as never, signer, options: propose })).rejects.toBeInstanceOf(
        BroadcastOutcomeUnknownError,
      );
    });

    it('co-signs the pending action with the same parameters', async () => {
      const options: TokenOperationOptions = { ...propose, signerId: MEMBER, group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID } };
      const { result, write } = await run(options, {
        actions: { ACTIVE: [[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], CLOSED: [] },
      });
      await result;
      expect(write.mock.calls[0]![0]).toMatchObject({ groupInfo: { otherSigner: 0, actionId: ACTION_ID }, identityId: identity(MEMBER) });
    });

    it.each<[string, Partial<TokenOperationOptions>, RegExp]>([
      ['different parameters', { change: { item: 'maxSupply', value: 1n } } as never, /differ from the pending group action/],
      ['a note', { publicNote: 'mine' }, /Only the proposer may attach a public note/],
    ])('refuses to co-sign with %s', async (_name, patch, message) => {
      const options = { ...propose, signerId: MEMBER, group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID }, ...patch } as TokenOperationOptions;
      const { result, write } = await run(options, {
        actions: { ACTIVE: [[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], CLOSED: [] },
      });
      await expect(result).rejects.toThrow(message);
      expect(write).not.toHaveBeenCalled();
    });

    it('refuses to sign an action twice or one that is gone', async () => {
      const signed = { ...propose, group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID } } as TokenOperationOptions;
      const twice = await run(signed, { actions: { ACTIVE: [[ACTION_ID, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])]], CLOSED: [] } });
      await expect(twice.result).rejects.toThrow(/already signed/);
      const gone = await run({ ...signed, signerId: MEMBER } as TokenOperationOptions, {});
      await expect(gone.result).rejects.toThrow(/no longer pending/);
    });
  });
});
