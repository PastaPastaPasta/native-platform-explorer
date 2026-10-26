import type { EvoSDK } from '@dashevo/evo-sdk';
import type { SdkQueryExecution } from '@sdk/hooks';
import { readProp } from './sdk-shape';
import { proTxHashToHex } from './protx';
import { WalkedMap } from './paged-walk';

// versionUpgradeVoteStatus pages are capped at 100 entries and keyed by hex
// proTxHash. The start hash is inclusive, so each later page repeats the
// previous page's last entry. Hard-capped to prevent runaway walks; a walk
// that hits the cap is marked truncated.
const PAGE_LIMIT = 100;
export const MAX_VOTE_PAGES = 100;

/** The voted version of a native ProtocolVersionUpgradeVoteStatus. Its
 *  `proTxHash` getter is an opaque ProTxHash with no accessors, so callers
 *  must take the hash from the map key instead. */
export function voteVersion(status: unknown): number | null {
  const raw = readProp<unknown>(status, 'version');
  const n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) ? n : null;
}

/** Every masternode vote, keyed by lowercase hex proTxHash. */
export async function fetchAllProtocolVotes(
  sdk: Pick<EvoSDK, 'protocol'>,
  execution: Pick<SdkQueryExecution, 'assertActive'>,
): Promise<WalkedMap<string, number>> {
  const out = new WalkedMap<string, number>();
  let start: string | undefined;
  for (let page = 0; page < MAX_VOTE_PAGES; page++) {
    execution.assertActive();
    const result = await sdk.protocol.versionUpgradeVoteStatus(start, PAGE_LIMIT);
    execution.assertActive();
    if (!(result instanceof Map) || result.size === 0) return out;
    let last: string | undefined;
    let added = 0;
    for (const [key, status] of result) {
      const hex = proTxHashToHex(String(key));
      const version = voteVersion(status);
      if (!hex) continue;
      last = hex;
      if (version === null || out.has(hex)) continue;
      out.set(hex, version);
      added++;
    }
    if (!last || added === 0 || result.size < PAGE_LIMIT) return out;
    start = last;
  }
  out.truncated = true;
  return out;
}

/** The vote recorded for exactly `hex`, from a page started at that hash.
 *  The page begins at the first hash ≥ start, so a node without a vote yields
 *  its successor's entry, which must not be attributed to it. */
export function findOwnVote(page: unknown, hex: string): number | null {
  if (!(page instanceof Map)) return null;
  for (const [key, status] of page) {
    if (proTxHashToHex(String(key)) === hex) return voteVersion(status);
  }
  return null;
}

export interface VoteTally {
  /** Voters per version, highest version first. */
  byVersion: Array<{ version: number; count: number }>;
  voted: number;
  /** Union of voters and every other evonode hash supplied as known. */
  known: number;
  unvoted: number;
}

export function tallyProtocolVotes(
  votes: Map<string, number>,
  knownEvonodes: Iterable<string> = [],
): VoteTally {
  const counts = new Map<number, number>();
  for (const v of votes.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  const known = new Set(votes.keys());
  for (const id of knownEvonodes) {
    const hex = proTxHashToHex(id);
    if (hex) known.add(hex);
  }
  return {
    byVersion: [...counts.entries()]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.version - a.version),
    voted: votes.size,
    known: known.size,
    unvoted: known.size - votes.size,
  };
}
