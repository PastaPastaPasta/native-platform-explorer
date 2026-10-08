import type { EvoSDK } from '@dashevo/evo-sdk';
import type { SdkQueryExecution } from './hooks';
import { epochInfoQuery, isEpochIndex } from './epoch-queries';

type EpochInfo = Awaited<ReturnType<EvoSDK['epoch']['current']>>;
type EpochMap = Awaited<ReturnType<EvoSDK['epoch']['epochsInfo']>>;

// These are the deployed Platform epoch_time_length_s configurations, not
// response metadata. Custom devnets can choose another duration.
export function epochDurationMs(network: string): bigint {
  if (network === 'mainnet') return 788_400_000n;
  if (network === 'testnet') return 3_600_000n;
  throw new Error('Current epoch is unavailable: this network has no verified epoch duration. Browse an explicit epoch instead.');
}

function unsignedInteger(value: unknown): bigint {
  if (typeof value === 'bigint' && value >= 0n && value <= 0xffff_ffff_ffff_ffffn) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error('Current epoch response contains an invalid timestamp or integer.');
}

function validateEpochs(data: EpochMap, startEpoch: number): EpochMap {
  if (!(data instanceof Map) || data.size > 1) throw new Error('Current epoch response has an unexpected shape.');
  for (const [index, info] of data) {
    if (!isEpochIndex(index) || index < startEpoch || !info || info.index !== index) {
      throw new Error('Current epoch response contains an unexpected epoch.');
    }
    unsignedInteger(info.firstBlockTime);
    unsignedInteger(info.firstBlockHeight);
    unsignedInteger(info.feeMultiplierPermille);
    for (const value of [info.firstCoreBlockHeight, info.protocolVersion]) {
      if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
        throw new Error('Current epoch response contains an invalid integer.');
      }
    }
  }
  return data;
}

function indexAt(timeMs: bigint, genesisTimeMs: bigint, durationMs: bigint): number {
  if (timeMs < genesisTimeMs) throw new Error('Current epoch timestamp precedes genesis.');
  const index = Number((timeMs - genesisTimeMs) / durationMs);
  if (!isEpochIndex(index)) throw new Error('Current epoch exceeds the supported epoch domain.');
  return index;
}

/** The pinned implicit current API uses unsigned metadata.epoch as a proof
 * bound. Explicitly prove epoch zero, then derive the bound from genesis and
 * Tenderdash-signed metadata.timeMs instead. Recheck against the selected
 * response's signed time so a rollover cannot publish the previous epoch.
 * Trusted-off reads use the local clock and retain their unverified label.
 * Never retry a proof failure through an ordinary or implicit current API. */
export async function fetchCurrentEpoch(
  sdk: Pick<EvoSDK, 'epoch'>,
  network: string,
  trusted: boolean,
  execution: Pick<SdkQueryExecution, 'assertActive'>,
): Promise<EpochInfo> {
  const durationMs = epochDurationMs(network);
  const read = async (index: number) => {
    execution.assertActive();
    const query = epochInfoQuery(index);
    if (trusted) {
      const response = await sdk.epoch.epochsInfoWithProof(query);
      execution.assertActive();
      if (!response?.proof || !response.metadata) throw new Error('Current epoch proof evidence is unavailable.');
      return { data: validateEpochs(response.data, index), timeMs: unsignedInteger(response.metadata.timeMs) };
    }
    const data = await sdk.epoch.epochsInfo(query);
    execution.assertActive();
    return { data: validateEpochs(data, index), timeMs: unsignedInteger(Date.now()) };
  };

  const genesisResponse = await read(0);
  const genesis = genesisResponse.data.get(0);
  if (!genesis) throw new Error('Current epoch cannot be established without epoch zero.');
  const genesisTimeMs = unsignedInteger(genesis.firstBlockTime);
  let index = indexAt(genesisResponse.timeMs, genesisTimeMs, durationMs);
  let previousTimeMs = genesisResponse.timeMs;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await read(index);
    if (response.timeMs < previousTimeMs) throw new Error('Current epoch response timestamp moved backwards.');
    previousTimeMs = response.timeMs;
    const observedIndex = indexAt(response.timeMs, genesisTimeMs, durationMs);
    if (observedIndex !== index) {
      index = observedIndex;
      continue;
    }
    const epoch = response.data.get(index);
    if (!epoch || unsignedInteger(epoch.firstBlockTime) > response.timeMs) {
      throw new Error('Current epoch does not match the response timestamp.');
    }
    return epoch;
  }
  throw new Error('Current epoch changed during verification. Retry the query.');
}
