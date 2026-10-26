import { describe, expect, it, vi } from 'vitest';
import { fetchAllEvonodeBlocks } from '../epoch';

function fullPage(offset: number) {
  // 100 entries keeps pagination going; keys are 32-byte hex ProTxHashes.
  return new Map(Array.from({ length: 100 }, (_, i) => [(offset + i).toString(16).padStart(64, '0'), 1n]));
}

describe('fetchAllEvonodeBlocks', () => {
  it('stops paging as soon as the caller session is retired', async () => {
    let retired = false;
    const evonodesProposedBlocksByRange = vi.fn(async ({ startAfter }: { startAfter?: string }) => {
      const page = fullPage(startAfter ? parseInt(startAfter, 16) + 1 : 0);
      if (evonodesProposedBlocksByRange.mock.calls.length === 2) retired = true;
      return page;
    });
    const assertActive = () => { if (retired) throw new Error('retired'); };
    await expect(fetchAllEvonodeBlocks({ epoch: { evonodesProposedBlocksByRange } }, 1, assertActive)).rejects.toThrow('retired');
    // Without the guard this would continue for up to 50 pages.
    expect(evonodesProposedBlocksByRange).toHaveBeenCalledTimes(2);
  });

  it('still pages to the end without a guard', async () => {
    const evonodesProposedBlocksByRange = vi.fn()
      .mockResolvedValueOnce(fullPage(0))
      .mockResolvedValueOnce(new Map([['ff'.padStart(64, '0'), 2n]]));
    const result = await fetchAllEvonodeBlocks({ epoch: { evonodesProposedBlocksByRange } }, 1);
    expect(evonodesProposedBlocksByRange).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(101);
  });
});
