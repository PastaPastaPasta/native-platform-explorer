// @vitest-environment node
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { evonodesMapToBars, normaliseEpoch, normaliseFinalizedEpoch } from '../epoch';

type NativeFinalized = { free: () => void; blockProposers: Map<string, bigint> };
let fromJSON: (value: Record<string, unknown>) => NativeFinalized;
beforeAll(async () => {
  // Use Node's native loader for the installed WASM module. These tests create
  // actual SDK classes offline, without transport or verification success mocks.
  const wasmUrl = pathToFileURL(`${process.cwd()}/node_modules/@dashevo/evo-sdk/dist/wasm.js`).href;
  const wasm = await import(/* @vite-ignore */ wasmUrl) as {
    ensureInitialized: () => Promise<void>;
    FinalizedEpochInfo: { fromJSON: typeof fromJSON };
  };
  await wasm.ensureInitialized();
  fromJSON = (value) => wasm.FinalizedEpochInfo.fromJSON(value);
});
const json = {
  $formatVersion: '0',
  firstBlockTime: 1720000000000, firstBlockHeight: 121, totalBlocksInEpoch: 12,
  firstCoreBlockHeight: 100, nextEpochStartCoreBlockHeight: 120,
  totalProcessingFees: '9007199254740993', totalDistributedStorageFees: 0,
  totalCreatedStorageFees: '9007199254740995', coreBlockRewards: '9007199254740997',
  feeMultiplierPermille: 1000, protocolVersion: 1,
  blockProposers: { '11111111111111111111111111111111': 12 },
};

describe('actual pinned SDK finalized epoch normalization', () => {
  it('keeps each native credit amount exact, including zero and values above MAX_SAFE_INTEGER', () => {
    const native = fromJSON(json);
    try {
      const result = normaliseFinalizedEpoch(native);
      expect(result).toMatchObject({ processingFees: 9007199254740993n, distributedStorageFees: 0n,
        createdStorageFees: 9007199254740995n, coreBlockRewards: 9007199254740997n,
        totalBlocks: 12n, protocolVersion: 1 });
      expect(evonodesMapToBars(result.blockProposers)).toEqual([{ proTxHash: '11111111111111111111111111111111', blocks: 12 }]);
    } finally { native.free(); }
  });
  it.each([0, 42])('uses the explicit requested index %s without inventing an end time or aggregate fee', (index) => {
    const native = fromJSON(json);
    try {
      expect(normaliseEpoch(native, index)).toMatchObject({ index, endAtMs: null, progressPct: null,
        firstBlockHeight: 121n, startAtMs: 1720000000000, feesCollected: null });
    } finally { native.free(); }
  });
  it('preserves an authoritative empty native proposer map', () => {
    const native = fromJSON({ ...json, blockProposers: {} });
    try { expect(normaliseFinalizedEpoch(native).blockProposers).toEqual(new Map()); }
    finally { native.free(); }
  });
});
