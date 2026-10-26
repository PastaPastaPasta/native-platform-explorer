import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllEvonodeBlocks,
  normaliseEpoch,
  proposerStanding,
  summariseProposers,
  withEpochDuration,
} from '../epoch';

const hash = (n: number) => n.toString(16).padStart(64, '0');

describe('proposer ranking across every page', () => {
  // Regression: the leaderboard used one page of 100 evonodes in proTxHash
  // order, so the busiest proposers on later pages were never ranked.
  it('ranks a proposer from the last page first and totals every page', async () => {
    const all = Array.from({ length: 250 }, (_, i): [string, bigint] => [hash(i + 1), i === 240 ? 30n : 2n]);
    const evonodesProposedBlocksByRange = vi.fn(async ({ limit, startAfter }: { limit?: number; startAfter?: string }) => {
      const from = startAfter ? all.findIndex(([h]) => h === startAfter) + 1 : 0;
      return new Map(all.slice(from, from + (limit ?? 100)));
    });
    const blocks = await fetchAllEvonodeBlocks({ epoch: { evonodesProposedBlocksByRange } } as never, 7);
    const summary = summariseProposers(blocks);
    expect(evonodesProposedBlocksByRange).toHaveBeenCalledTimes(3);
    expect(summary.proposers).toBe(250);
    expect(summary.totalBlocks).toBe(249 * 2 + 30);
    expect(summary.bars[0]).toEqual({ proTxHash: hash(241), blocks: 30 });
  });

  it('breaks ties by proTxHash so the order is stable', () => {
    const bars = summariseProposers(new Map([[hash(3), 1n], [hash(1), 1n], [hash(2), 4n]])).bars;
    expect(bars.map((b) => b.proTxHash)).toEqual([hash(2), hash(1), hash(3)]);
  });
});

describe('proposerStanding', () => {
  const m = new Map([[hash(1), 10], [hash(2), 10], [hash(3), 4]]);
  it('uses competition ranking and complete totals', () => {
    expect(proposerStanding(m, hash(2))).toEqual({ blocks: 10, rank: 1, proposers: 3, totalBlocks: 24, topBlocks: 10 });
    expect(proposerStanding(m, hash(3))?.rank).toBe(3);
    expect(proposerStanding(m, hash(9))).toBeNull();
  });
});

describe('withEpochDuration', () => {
  const start = 1_720_000_000_000;
  const epoch = normaliseEpoch({ index: 5, firstBlockTime: start });
  it('estimates end and progress from the configured epoch length', () => {
    expect(epoch.progressPct).toBeNull();
    const filled = withEpochDuration(epoch, 3_600_000, start + 900_000);
    expect(filled.endAtMs).toBe(start + 3_600_000);
    expect(filled.progressPct).toBe(25);
    expect(withEpochDuration(epoch, 3_600_000, start + 9_000_000).progressPct).toBe(100);
  });
  it('leaves epochs without a start, or without a known length, alone', () => {
    expect(withEpochDuration(epoch, null)).toBe(epoch);
    const noStart = normaliseEpoch({ index: 5 });
    expect(withEpochDuration(noStart, 3_600_000)).toBe(noStart);
  });
});
