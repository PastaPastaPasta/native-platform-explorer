import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllProtocolVotes,
  findOwnVote,
  MAX_VOTE_PAGES,
  tallyProtocolVotes,
  voteVersion,
} from '../protocol-votes';
import { proTxHashToBase58 } from '../protx';
import { isTruncatedWalk } from '../paged-walk';

const active = { assertActive: () => {} };

const hash = (n: number) => n.toString(16).padStart(64, '0');
// Native vote statuses expose `version` (and an opaque proTxHash) as getters.
const status = (version: number) =>
  Object.create({ version, proTxHash: { __type: 'ProTxHash' } }) as object;

/** Mimics DAPI: pages of `count` entries starting at the first hash ≥ start. */
function fakeSdk(votes: Array<[string, number]>) {
  const versionUpgradeVoteStatus = vi.fn(async (start: string | undefined, count: number) => {
    const from = start ? votes.findIndex(([h]) => h >= start) : 0;
    return new Map(votes.slice(from, from + count).map(([h, v]) => [h, status(v)]));
  });
  return { sdk: { protocol: { versionUpgradeVoteStatus } } as never, versionUpgradeVoteStatus };
}

describe('fetchAllProtocolVotes', () => {
  it('walks every page, de-duplicating the inclusive start entry', async () => {
    const votes = Array.from({ length: 254 }, (_, i): [string, number] => [hash(i + 1), i < 200 ? 13 : 12]);
    const { sdk, versionUpgradeVoteStatus } = fakeSdk(votes);
    const all = await fetchAllProtocolVotes(sdk, active);
    expect(all.size).toBe(254);
    expect(isTruncatedWalk(all)).toBe(false);
    expect(all.get(hash(254))).toBe(12);
    expect(versionUpgradeVoteStatus).toHaveBeenCalledTimes(3);
    expect(versionUpgradeVoteStatus.mock.calls[1]).toEqual([hash(100), 100]);
  });

  it('stops on an empty first page', async () => {
    const { sdk } = fakeSdk([]);
    const all = await fetchAllProtocolVotes(sdk, active);
    expect(all.size).toBe(0);
    expect(isTruncatedWalk(all)).toBe(false);
  });

  it('stops without another request once the session retires mid-walk', async () => {
    const votes = Array.from({ length: 254 }, (_, i): [string, number] => [hash(i + 1), 13]);
    const { sdk, versionUpgradeVoteStatus } = fakeSdk(votes);
    let retired = false;
    const execution = { assertActive: () => { if (retired) throw new Error('session retired'); } };
    versionUpgradeVoteStatus.mockImplementationOnce(async (start, count) => {
      retired = true;
      return new Map(votes.slice(0, count).map(([h, v]) => [h, status(v)]));
    });
    await expect(fetchAllProtocolVotes(sdk, execution)).rejects.toThrow('session retired');
    expect(versionUpgradeVoteStatus).toHaveBeenCalledTimes(1);
  });

  it('marks the result truncated when the page cap stops the walk', async () => {
    // Every page is full, so only the cap ends the walk.
    const versionUpgradeVoteStatus = vi.fn(async (start: string | undefined, count: number) => {
      const from = start ? parseInt(start, 16) : 1;
      return new Map(Array.from({ length: count }, (_, i) => [hash(from + i), status(13)]));
    });
    const all = await fetchAllProtocolVotes({ protocol: { versionUpgradeVoteStatus } } as never, active);
    expect(versionUpgradeVoteStatus).toHaveBeenCalledTimes(MAX_VOTE_PAGES);
    expect(isTruncatedWalk(all)).toBe(true);
    expect(all).toBeInstanceOf(Map);
  });
});

describe('findOwnVote', () => {
  it('returns the version for the exact proTxHash only', () => {
    const page = new Map([[hash(5), status(14)]]);
    expect(findOwnVote(page, hash(5))).toBe(14);
    // A page started at hash(4) that begins with its successor is not hash(4)'s vote.
    expect(findOwnVote(page, hash(4))).toBeNull();
    expect(findOwnVote(undefined, hash(5))).toBeNull();
  });

  it('reads the version off native getters, never the opaque proTxHash', () => {
    expect(voteVersion(status(13))).toBe(13);
    expect(voteVersion({ version: 2n })).toBe(2);
    expect(voteVersion({})).toBeNull();
  });
});

describe('tallyProtocolVotes', () => {
  it('counts voters per version and unvoted evonodes from the known set', () => {
    const votes = new Map([[hash(1), 13], [hash(2), 13], [hash(3), 12]]);
    // Known evonodes arrive as hex (live) or base58 (finalized) and overlap voters.
    const known = [hash(1), proTxHashToBase58(hash(4))!, hash(5), 'not-a-hash'];
    expect(tallyProtocolVotes(votes, known)).toEqual({
      byVersion: [{ version: 13, count: 2 }, { version: 12, count: 1 }],
      voted: 3,
      known: 5,
      unvoted: 2,
    });
  });
});
