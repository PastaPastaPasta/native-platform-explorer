import type { EvoSDK } from '@dashevo/evo-sdk';
import { CancelledError } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockSdk } from '@/test/sdk';
import { epochDurationMs, fetchCurrentEpoch } from '../current-epoch';
import { MAX_EPOCH_INDEX } from '../epoch-queries';

type EpochQuery = NonNullable<Parameters<EvoSDK['epoch']['epochsInfo']>[0]>;
const genesisTime = 1_724_795_532_000n;
const duration = 788_400_000n;
const at = (index: number) => genesisTime + BigInt(index) * duration;
const info = (index: number) => ({
  index, firstBlockTime: at(index), firstBlockHeight: 1n,
  firstCoreBlockHeight: 1, feeMultiplierPermille: 1000n, protocolVersion: 13,
});
const envelope = (index: number, timeMs = at(84) + 1n) => ({
  data: new Map([[index, info(index)]]), metadata: { timeMs, epoch: 42 }, proof: {},
});
const active = () => ({ assertActive: vi.fn() });

// Unit doubles test selection and lifecycle, not cryptographic verification.
// scripts/replay-current-epoch.mjs exercises the real public SDK and signature.
afterEach(() => { vi.restoreAllMocks(); });

describe('authenticated current epoch selection', () => {
  it('selects epoch 84 using signed time instead of the metadata epoch 42', async () => {
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0)).mockResolvedValueOnce(envelope(84));
    const sdk = createMockSdk({ epoch: { epochsInfoWithProof } });
    const epoch = await fetchCurrentEpoch(sdk, 'mainnet', true, active());
    expect(epoch.index).toBe(84);
    expect(epochsInfoWithProof.mock.calls.map(([query]) => query)).toEqual([
      { startEpoch: 0, count: 1, ascending: true },
      { startEpoch: 84, count: 1, ascending: true },
    ]);
    expect(sdk.epoch.current).not.toHaveBeenCalled();
    expect(sdk.epoch.currentWithProof).not.toHaveBeenCalled();
  });

  it('ignores arbitrary missing or hostile unsigned epoch metadata', async () => {
    const genesis = envelope(0);
    const current = envelope(84);
    Object.defineProperty(genesis.metadata, 'epoch', { get() { throw new Error('unsigned field was read'); } });
    Object.defineProperty(current.metadata, 'epoch', { get() { throw new Error('unsigned field was read'); } });
    const sdk = createMockSdk({ epoch: {
      epochsInfoWithProof: vi.fn().mockResolvedValueOnce(genesis).mockResolvedValueOnce(current),
    } });
    await expect(fetchCurrentEpoch(sdk, 'mainnet', true, active())).resolves.toMatchObject({ index: 84 });
  });

  it('does not depend on initialized epoch indexes being contiguous', async () => {
    const epochsInfoWithProof = vi.fn((query: EpochQuery) => Promise.resolve(envelope(query.startEpoch === 0 ? 0 : 84)));
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active()))
      .resolves.toMatchObject({ index: 84 });
    expect(epochsInfoWithProof).toHaveBeenCalledTimes(2);
  });

  it('retries the explicit derived bound across an epoch rollover', async () => {
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0, at(84) + 1n))
      .mockResolvedValueOnce(envelope(84, at(85)))
      .mockResolvedValueOnce(envelope(85, at(85) + 1n));
    const epoch = await fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active());
    expect(epoch.index).toBe(85);
    expect(epochsInfoWithProof.mock.calls.map(([query]) => query.startEpoch)).toEqual([0, 84, 85]);
  });

  it('fails closed when every response crosses another epoch boundary', async () => {
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0))
      .mockResolvedValueOnce(envelope(84, at(85)))
      .mockResolvedValueOnce(envelope(85, at(86)))
      .mockResolvedValueOnce(envelope(86, at(87)));
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active()))
      .rejects.toThrow('changed during verification');
    expect(epochsInfoWithProof).toHaveBeenCalledTimes(4);
  });

  it('rejects a decreasing authenticated timestamp', async () => {
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0))
      .mockResolvedValueOnce(envelope(84, at(42)));
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active()))
      .rejects.toThrow('moved backwards');
    expect(epochsInfoWithProof).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing genesis', { ...envelope(0), data: new Map() }, 'without epoch zero'],
    ['later record in genesis query', envelope(42), 'without epoch zero'],
    ['missing proof', { ...envelope(0), proof: undefined }, 'evidence is unavailable'],
    ['missing metadata', { ...envelope(0), metadata: undefined }, 'evidence is unavailable'],
    ['non-map data', { ...envelope(0), data: [] }, 'unexpected shape'],
    ['undefined data', { ...envelope(0), data: new Map([[0, undefined]]) }, 'unexpected epoch'],
    ['mismatched key', { ...envelope(0), data: new Map([[0, info(42)]]) }, 'unexpected epoch'],
    ['fractional time', { ...envelope(0), metadata: { timeMs: 1.5 } }, 'invalid timestamp'],
    ['before genesis', envelope(0, genesisTime - 1n), 'precedes genesis'],
    ['out of domain', envelope(0, at(MAX_EPOCH_INDEX + 1)), 'supported epoch domain'],
    ['incomplete fields', { ...envelope(0), data: new Map([[0, { index: 0 }]]) }, 'invalid timestamp'],
  ])('rejects %s without selecting a current epoch', async (_, response, message) => {
    const epochsInfoWithProof = vi.fn().mockResolvedValue(response);
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active()))
      .rejects.toThrow(message);
    expect(epochsInfoWithProof).toHaveBeenCalledOnce();
  });

  it.each([
    ['historical record', envelope(42), 'unexpected epoch'],
    ['empty current record', { ...envelope(84), data: new Map() }, 'does not match'],
    ['later unexpected record', envelope(85), 'does not match'],
    ['future start time', { ...envelope(84), data: new Map([[84, { ...info(84), firstBlockTime: at(85) }]]) }, 'does not match'],
  ])('rejects a %s at the final signed epoch-84 time', async (_, response, message) => {
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0)).mockResolvedValueOnce(response);
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, active()))
      .rejects.toThrow(message);
  });

  it('does not fall back to an ordinary or implicit query after a native proof failure', async () => {
    const failure = Object.assign(new Error('signature verification failed'), { name: 'Proof', kind: 4 });
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0)).mockRejectedValueOnce(failure);
    const sdk = createMockSdk({ epoch: { epochsInfoWithProof, epochsInfo: vi.fn() } });
    await expect(fetchCurrentEpoch(sdk, 'mainnet', true, active())).rejects.toBe(failure);
    expect(sdk.epoch.epochsInfo).not.toHaveBeenCalled();
    expect(sdk.epoch.current).not.toHaveBeenCalled();
    expect(sdk.epoch.currentWithProof).not.toHaveBeenCalled();
  });

  it('does not publish or continue after session retirement during a request', async () => {
    let resolve!: (value: ReturnType<typeof envelope>) => void;
    const pendingResponse = new Promise<ReturnType<typeof envelope>>((done) => { resolve = done; });
    const epochsInfoWithProof = vi.fn().mockReturnValue(pendingResponse);
    let retired = false;
    const pending = fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'mainnet', true, {
      assertActive() { if (retired) throw new CancelledError(); },
    });
    retired = true;
    resolve(envelope(0));
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
    expect(epochsInfoWithProof).toHaveBeenCalledOnce();
  });

  it.each(['devnet-paloma', 'devnet-custom', 'unknown'])('fails closed for unconfigured duration on %s before transport', async (network) => {
    const epochsInfoWithProof = vi.fn();
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), network, true, active()))
      .rejects.toThrow('no verified epoch duration');
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
  });

  it('uses Testnet\'s explicit deployment duration', async () => {
    const timeMs = genesisTime + 84n * epochDurationMs('testnet') + 1n;
    const epochsInfoWithProof = vi.fn().mockResolvedValueOnce(envelope(0, timeMs))
      .mockResolvedValueOnce({ ...envelope(84, timeMs), data: new Map([[84, { ...info(84), firstBlockTime: timeMs - 1n }]]) });
    await expect(fetchCurrentEpoch(createMockSdk({ epoch: { epochsInfoWithProof } }), 'testnet', true, active()))
      .resolves.toMatchObject({ index: 84 });
  });

  it('uses the local clock and ordinary explicit queries when trusted mode is off', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Number(at(84) + 1n));
    const epochsInfo = vi.fn().mockResolvedValueOnce(envelope(0).data).mockResolvedValueOnce(envelope(84).data);
    const epochsInfoWithProof = vi.fn();
    const sdk = createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } });
    await expect(fetchCurrentEpoch(sdk, 'mainnet', false, active())).resolves.toMatchObject({ index: 84 });
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
    expect(epochsInfo.mock.calls.map(([query]) => query.startEpoch)).toEqual([0, 84]);
  });
});
