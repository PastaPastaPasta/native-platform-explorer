// @vitest-environment node
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { normaliseQuorums, quorumBreakdown } from '../quorums';

let fromJSON: (value: Record<string, unknown>) => unknown;
beforeAll(async () => {
  // Real pinned-SDK classes, created offline: rows must survive native getters.
  const wasmUrl = pathToFileURL(`${process.cwd()}/node_modules/@dashevo/evo-sdk/dist/wasm.js`).href;
  const wasm = await import(/* @vite-ignore */ wasmUrl) as {
    ensureInitialized: () => Promise<void>;
    CurrentQuorumsInfo: { fromJSON: typeof fromJSON };
  };
  await wasm.ensureInitialized();
  fromJSON = (value) => wasm.CurrentQuorumsInfo.fromJSON(value);
});

const q = (hash: string, quorumType: string, memberCount: number, threshold: number) =>
  ({ quorumHash: hash.padStart(64, '0'), quorumType, memberCount, threshold, isVerified: true });

// Shapes observed live: mainnet reports LLMQ_100_67; testnet's 25-member
// platform quorums are a type the pinned SDK reports as LLMQ_TYPE_UNKNOWN.
const json = {
  height: '458827',
  quorums: [q('a1', 'LLMQ_100_67', 100, 67), q('a2', 'LLMQ_100_67', 100, 67), q('a3', 'LLMQ_100_67', 99, 66)],
};

describe('currentQuorumsInfo normalisation', () => {
  it('reads rows off the native CurrentQuorumsInfo', () => {
    const summary = normaliseQuorums(fromJSON(json));
    expect(summary.height).toBe(458827n);
    expect(summary.quorums).toHaveLength(3);
    expect(summary.quorums[2]).toEqual({
      quorumHash: '00'.repeat(31) + 'a3', quorumType: 'LLMQ_100_67', memberCount: 99, threshold: 66, isVerified: true,
    });
  });

  it('groups by reported type, size and threshold, largest first', () => {
    expect(quorumBreakdown(normaliseQuorums(fromJSON(json)).quorums)).toEqual([
      { quorumType: 'LLMQ_100_67', memberCount: 100, threshold: 67, count: 2 },
      { quorumType: 'LLMQ_100_67', memberCount: 99, threshold: 66, count: 1 },
    ]);
  });

  it('accepts plain objects and drops rows without a hash', () => {
    const summary = normaliseQuorums({ height: 5, quorums: [q('b1', 'LLMQ_TYPE_UNKNOWN', 25, 16), { memberCount: 3 }] });
    expect(summary.height).toBe(5n);
    expect(summary.quorums.map((r) => r.quorumType)).toEqual(['LLMQ_TYPE_UNKNOWN']);
    expect(normaliseQuorums(undefined)).toEqual({ height: null, quorums: [] });
  });
});
