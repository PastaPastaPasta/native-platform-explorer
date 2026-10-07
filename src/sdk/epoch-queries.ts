import type { EvoSDK } from '@dashevo/evo-sdk';
import type { SdkQueryExecution } from './hooks';

type EpochsQuery = NonNullable<Parameters<EvoSDK['epoch']['epochsInfo']>[0]>;
type FinalizedEpochsQuery = Parameters<EvoSDK['epoch']['finalizedInfos']>[0];
type EpochsInfo = Awaited<ReturnType<EvoSDK['epoch']['epochsInfo']>>;
type ExplicitEpochQuery = EpochsQuery & FinalizedEpochsQuery & {
  startEpoch: number; count: number; ascending: true;
};

// The pinned SDK decodes at most 128 child layers per proof. A default
// 100-epoch request can include empty future epoch trees and exceed that cap.
export const EPOCH_BATCH_SIZE = 10;
// Platform reserves the first 256 u16 keys for other credit-pool state.
export const MAX_EPOCH_INDEX = 65_279;
export const MAX_EPOCH_RANGE = 200;

export function isEpochIndex(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index)
    && index >= 0 && index <= MAX_EPOCH_INDEX;
}

export function epochRangeError(from: unknown, to: unknown): string | null {
  if (!isEpochIndex(from) || !isEpochIndex(to)) {
    return `Epoch indexes must be whole numbers from 0 to ${MAX_EPOCH_INDEX}.`;
  }
  if (from > to) return 'Start epoch must be less than or equal to the end epoch.';
  if (to - from + 1 > MAX_EPOCH_RANGE) {
    return `Choose a range of at most ${MAX_EPOCH_RANGE} epochs.`;
  }
  return null;
}

export function epochInfoQuery(index: number): ExplicitEpochQuery {
  if (!isEpochIndex(index)) throw new Error(epochRangeError(index, index)!);
  return { startEpoch: index, count: 1, ascending: true };
}

export function epochRangeQueries(from: number, to: number): ExplicitEpochQuery[] {
  const error = epochRangeError(from, to);
  if (error) throw new Error(error);
  return Array.from({ length: Math.ceil((to - from + 1) / EPOCH_BATCH_SIZE) }, (_, i) => {
    const startEpoch = from + i * EPOCH_BATCH_SIZE;
    return { startEpoch, count: Math.min(EPOCH_BATCH_SIZE, to - startEpoch + 1), ascending: true };
  });
}

/** Every batch uses the ordinary SDK method, which still verifies internally
 * in trusted mode. An aggregate does not have a single proof or block height,
 * so callers must not attach one batch's proof envelope to the merged result. */
export async function fetchEpochRange(
  sdk: Pick<EvoSDK, 'epoch'>,
  from: number,
  to: number,
  execution: Pick<SdkQueryExecution, 'assertActive'>,
): Promise<EpochsInfo> {
  const result: EpochsInfo = new Map();
  for (const query of epochRangeQueries(from, to)) {
    execution.assertActive();
    const batch = await sdk.epoch.epochsInfo(query);
    execution.assertActive();
    for (const [index, info] of batch) {
      if (isEpochIndex(index) && index >= query.startEpoch && index < query.startEpoch + query.count) {
        result.set(index, info);
      }
    }
  }
  return result;
}
