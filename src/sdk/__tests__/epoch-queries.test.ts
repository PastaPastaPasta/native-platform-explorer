import type { EvoSDK } from '@dashevo/evo-sdk';
import { CancelledError } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createMockSdk } from '@/test/sdk';
import { epochInfoQuery, epochRangeError, fetchEpochRange, isEpochIndex } from '../epoch-queries';

type EpochQuery = NonNullable<Parameters<EvoSDK['epoch']['epochsInfo']>[0]>;
type EpochMap = Awaited<ReturnType<EvoSDK['epoch']['epochsInfo']>>;

function emptyEpochs(query: EpochQuery): EpochMap {
  return new Map(Array.from({ length: query.count! }, (_, i) => [query.startEpoch! + i, undefined]));
}

describe('pinned SDK epoch query contract', () => {
  it('uses the actual epoch and finalized facade input interfaces', () => {
    const query = epochInfoQuery(42);
    const regular: EpochQuery = query;
    const finalized: Parameters<EvoSDK['epoch']['finalizedInfos']>[0] = query;
    expect(regular).toEqual({ startEpoch: 42, count: 1, ascending: true });
    expect(finalized).toEqual(regular);
    // These names were silently ignored by the pinned WASM parser. Keep the
    // compiler tied to the published facade contract instead of an `as never`.
    // @ts-expect-error The pinned facade accepts startEpoch, not startIndex.
    const obsolete: EpochQuery = { startIndex: 42, endIndex: 42 };
    expect(obsolete).not.toEqual(query);
  });

  it.each([undefined, NaN, Infinity, -1, 0.5, 65_280, 65_535, 65_536])('rejects an invalid epoch index %s', (index) => {
    expect(isEpochIndex(index)).toBe(false);
    expect(epochRangeError(index, index)).toContain('whole numbers');
  });

  it.each([0, 42, 65_279])('accepts a supported Platform epoch index %s', (index) => {
    expect(isEpochIndex(index)).toBe(true);
    expect(epochInfoQuery(index)).toEqual({ startEpoch: index, count: 1, ascending: true });
  });
});

describe('bounded epoch history', () => {
  it('requests the exact inclusive range in bounded batches and trims unexpected keys', async () => {
    const epochsInfo = vi.fn((query: EpochQuery) => Promise.resolve(new Map([
      ...emptyEpochs(query), [-1, undefined], [65_535, undefined],
    ])));
    const sdk = createMockSdk({ epoch: { epochsInfo } });
    const result = await fetchEpochRange(sdk, 12, 34, { assertActive: vi.fn() });
    expect(epochsInfo.mock.calls.map(([query]) => query)).toEqual([
      { startEpoch: 12, count: 10, ascending: true },
      { startEpoch: 22, count: 10, ascending: true },
      { startEpoch: 32, count: 3, ascending: true },
    ]);
    expect([...result.keys()]).toEqual(Array.from({ length: 23 }, (_, i) => i + 12));
  });

  it('continues through an empty batch instead of truncating the requested range', async () => {
    const epochsInfo = vi.fn<(query: EpochQuery) => Promise<EpochMap>>()
      .mockResolvedValueOnce(new Map()).mockImplementation((query) => Promise.resolve(emptyEpochs(query)));
    const result = await fetchEpochRange(createMockSdk({ epoch: { epochsInfo } }), 0, 10, { assertActive: vi.fn() });
    expect(epochsInfo).toHaveBeenCalledTimes(2);
    expect([...result.keys()]).toEqual([10]);
  });

  it('does not return partial data or continue after an SDK verification failure', async () => {
    const error = new Error('Proof verification failed');
    const epochsInfo = vi.fn<(query: EpochQuery) => Promise<EpochMap>>()
      .mockImplementationOnce((query) => Promise.resolve(emptyEpochs(query)))
      .mockRejectedValue(error);
    await expect(fetchEpochRange(createMockSdk({ epoch: { epochsInfo } }), 0, 20, { assertActive: vi.fn() }))
      .rejects.toBe(error);
    expect(epochsInfo).toHaveBeenCalledTimes(2);
  });

  it('stops before the next batch when the session retires during an SDK request', async () => {
    let resolve!: (value: EpochMap) => void;
    const response = new Promise<EpochMap>((done) => { resolve = done; });
    const epochsInfo = vi.fn().mockReturnValue(response);
    const controller = new AbortController();
    const pending = fetchEpochRange(createMockSdk({ epoch: { epochsInfo } }), 0, 20, {
      assertActive: () => { if (controller.signal.aborted) throw new CancelledError(); },
    });
    expect(epochsInfo).toHaveBeenCalledOnce();
    controller.abort();
    resolve(emptyEpochs({ startEpoch: 0, count: 10 }));
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
    expect(epochsInfo).toHaveBeenCalledOnce();
  });

  it('rejects invalid or oversized ranges before launching transport', async () => {
    const epochsInfo = vi.fn();
    const sdk = createMockSdk({ epoch: { epochsInfo } });
    await expect(fetchEpochRange(sdk, 3, 2, { assertActive: vi.fn() })).rejects.toThrow('less than or equal');
    await expect(fetchEpochRange(sdk, 0, 200, { assertActive: vi.fn() })).rejects.toThrow('at most 200');
    await expect(fetchEpochRange(sdk, 0.5, 10, { assertActive: vi.fn() })).rejects.toThrow('whole numbers');
    expect(epochsInfo).not.toHaveBeenCalled();
  });
});
