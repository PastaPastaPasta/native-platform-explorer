import { describe, expect, it, vi } from 'vitest';
import { loadTokenSnapshot, readProvedBalances, resolveTokenTarget } from '../state';
import { CONTRACT_ID, MEMBER, OWNER, TOKEN_ID, contractObject } from './fixtures';

function sdkWith(overrides: Record<string, unknown> = {}) {
  return {
    tokens: {
      calculateId: vi.fn().mockResolvedValue(TOKEN_ID),
      contractInfo: vi.fn().mockResolvedValue({ contractId: { toBase58: () => CONTRACT_ID }, tokenContractPosition: 0 }),
      statuses: vi.fn().mockResolvedValue(new Map([[TOKEN_ID, { isPaused: true }]])),
      totalSupplyWithProof: vi.fn().mockResolvedValue({
        data: { totalSupply: 7n },
        metadata: { toJSON: () => ({ height: 42, timeMs: 1_000 }) },
      }),
      directPurchasePrices: vi.fn().mockResolvedValue(new Map([[TOKEN_ID, { basePrice: '3', currentPrice: '1' }]])),
      balances: vi.fn().mockResolvedValue(new Map([[OWNER, 5n]])),
      identitiesTokenInfos: vi.fn().mockResolvedValue(new Map([[MEMBER, { isFrozen: true }]])),
      balancesWithProof: vi.fn().mockResolvedValue({ data: new Map([[OWNER, 9n]]), metadata: { height: 43 } }),
      ...overrides,
    },
    contracts: { fetch: vi.fn().mockResolvedValue(contractObject()) },
    identities: {
      balances: vi.fn().mockResolvedValue(new Map([[OWNER, 1n], [MEMBER, 1n], ['A'.repeat(44), undefined]])),
      balance: vi.fn().mockResolvedValue(11n),
    },
    group: { actions: vi.fn(), actionSigners: vi.fn() },
  };
}

describe('token state', () => {
  it('resolves a token by ID or by contract and position', async () => {
    const sdk = sdkWith();
    await expect(resolveTokenTarget(sdk as never, { tokenId: TOKEN_ID })).resolves.toEqual({ tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 });
    await expect(resolveTokenTarget(sdk as never, { contractId: CONTRACT_ID, position: 0 })).resolves.toEqual({ tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 });
    expect(sdk.tokens.calculateId).toHaveBeenCalledWith(CONTRACT_ID, 0);
  });

  it('rejects inconsistent or malformed targets', async () => {
    const sdk = sdkWith();
    await expect(resolveTokenTarget(sdk as never, { tokenId: 'B'.repeat(44), contractId: CONTRACT_ID, position: 0 })).rejects.toThrow(/is not position 0/);
    await expect(resolveTokenTarget(sdk as never, { tokenId: 'nope' })).rejects.toThrow(/not a valid identifier/);
    await expect(resolveTokenTarget(sdk as never, { contractId: CONTRACT_ID, position: 70000 })).rejects.toThrow(/0 to 65535/);
    await expect(resolveTokenTarget(sdk as never, {})).rejects.toThrow(/Enter a token ID/);
    sdk.tokens.contractInfo.mockResolvedValue(undefined);
    await expect(resolveTokenTarget(sdk as never, { tokenId: TOKEN_ID })).rejects.toThrow(/No token/);
  });

  it('loads the state a token write depends on', async () => {
    const sdk = sdkWith();
    const snapshot = await loadTokenSnapshot(sdk as never, {
      target: { tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 },
      holderIds: [OWNER, MEMBER, 'A'.repeat(44), 'not-an-id'],
      creditsOf: OWNER,
    });
    expect(snapshot).toMatchObject({
      paused: true,
      totalSupply: 7n,
      price: { first: 3n, last: 1n },
      credits: 11n,
      nowMs: 1_000,
      height: 42n,
      holders: {
        [OWNER]: { exists: true, balance: 5n, frozen: false },
        [MEMBER]: { exists: true, balance: 0n, frozen: true },
        ['A'.repeat(44)]: { exists: false, balance: 0n, frozen: false },
      },
    });
    expect(snapshot.model.name).toBe('npetok');
    expect(sdk.identities.balances).toHaveBeenCalledWith([OWNER, MEMBER, 'A'.repeat(44)]);
  });

  it('treats a token without a status record as active and without a price as not for sale', async () => {
    const sdk = sdkWith({ statuses: vi.fn().mockResolvedValue(new Map()), directPurchasePrices: vi.fn().mockResolvedValue(new Map()) });
    const snapshot = await loadTokenSnapshot(sdk as never, { target: { tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 }, holderIds: [] });
    expect(snapshot.paused).toBe(false);
    expect(snapshot.price).toBeUndefined();
    expect(snapshot.holders).toEqual({});
  });

  it('reads balances with their proof height', async () => {
    const sdk = sdkWith();
    await expect(readProvedBalances(sdk as never, TOKEN_ID, [OWNER, MEMBER])).resolves.toEqual({
      balances: { [OWNER]: 9n, [MEMBER]: 0n },
      height: 43n,
    });
  });
});
