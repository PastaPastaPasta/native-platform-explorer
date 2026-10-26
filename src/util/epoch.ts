import type { EvoSDK } from '@dashevo/evo-sdk';
import type { SdkQueryExecution } from '@sdk/hooks';
import { readProp } from './sdk-shape';
import { WalkedMap } from './paged-walk';

export interface NormalisedEpoch {
  index: number;
  startAtMs: number | null;
  endAtMs: number | null;
  firstBlockHeight: bigint | null;
  feesCollected: bigint | null;
  progressPct: number | null;
  raw: unknown;
}

function toBigInt(x: unknown): bigint | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number') return BigInt(Math.trunc(x));
  if (typeof x === 'string' && /^-?\d+$/.test(x)) return BigInt(x);
  return null;
}

function toNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'bigint') return Number(x);
  if (typeof x === 'string' && /^-?\d+(?:\.\d+)?$/.test(x)) return Number(x);
  return null;
}

function toMs(x: unknown): number | null {
  const n = toNumber(x);
  if (n === null) return null;
  // Heuristic: if the value looks like seconds (≤1e10), upscale.
  return n < 1e11 ? n * 1000 : n;
}

export function normaliseEpoch(input: unknown, fallbackIndex = 0): NormalisedEpoch {
  const idx =
    toNumber(readProp(input, 'index')) ??
    toNumber(readProp(input, 'number')) ??
    toNumber(readProp(input, 'epochIndex')) ??
    fallbackIndex;
  const startMs =
    toMs(readProp(input, 'startTime')) ??
    toMs(readProp(input, 'firstBlockTime')) ??
    toMs(readProp(input, 'startAt'));
  const endMs =
    toMs(readProp(input, 'endTime')) ??
    toMs(readProp(input, 'nextEpochTime')) ??
    toMs(readProp(input, 'endAt'));
  const firstBlock =
    toBigInt(readProp(input, 'firstBlockHeight')) ??
    toBigInt(readProp(input, 'firstCoreBlockHeight'));
  const fees =
    toBigInt(readProp(input, 'feesCollected')) ??
    toBigInt(readProp(input, 'totalFees'));

  let progress: number | null = null;
  if (startMs !== null && endMs !== null && endMs > startMs) {
    const now = Date.now();
    progress = ((now - startMs) / (endMs - startMs)) * 100;
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;
  }

  return {
    index: idx,
    startAtMs: startMs,
    endAtMs: endMs,
    firstBlockHeight: firstBlock,
    feesCollected: fees,
    progressPct: progress,
    raw: input,
  };
}

/** Finalized fields are kept separate from ordinary epoch metadata. Native
 * SDK getters and bigint credit amounts must survive normalization unchanged. */
export interface NormalisedFinalizedEpoch {
  totalBlocks: bigint | null;
  processingFees: bigint | null;
  distributedStorageFees: bigint | null;
  createdStorageFees: bigint | null;
  coreBlockRewards: bigint | null;
  protocolVersion: number | null;
  blockProposers: Map<unknown, unknown> | null;
}

export function normaliseFinalizedEpoch(input: unknown): NormalisedFinalizedEpoch {
  const proposers = readProp(input, 'blockProposers');
  return {
    totalBlocks: toBigInt(readProp(input, 'totalBlocksInEpoch')),
    processingFees: toBigInt(readProp(input, 'totalProcessingFees')),
    distributedStorageFees: toBigInt(readProp(input, 'totalDistributedStorageFees')),
    createdStorageFees: toBigInt(readProp(input, 'totalCreatedStorageFees')),
    coreBlockRewards: toBigInt(readProp(input, 'coreBlockRewards')),
    protocolVersion: toNumber(readProp(input, 'protocolVersion')),
    blockProposers: proposers instanceof Map ? proposers : null,
  };
}

// Server caps limit at 100 per request. When we need every proposer in an
// epoch (e.g. to compute rank + share for a single evonode), walk pages via
// `startAfter` until we've seen every entry. Hard-capped to prevent runaway
// calls on pathologically large epochs; a walk that hits the cap is marked
// truncated.
const PAGE_LIMIT = 100;
export const MAX_PROPOSER_PAGES = 50;

/** Extracts a hex proTxHash from the SDK's Identifier map key. `startAfter`
 *  expects ProTxHashLike = ProTxHash | string | Uint8Array where the string
 *  form is 64-char hex; the default `String(identifier)` returns base58 (44
 *  chars) and DAPI rejects it with "Invalid ProTxHash hex string: bad hex
 *  string length 44 (expected 64)". */
function keyToHex(key: unknown): string | undefined {
  if (!key) return undefined;
  if (typeof key === 'string') {
    return /^[0-9a-fA-F]{64}$/.test(key) ? key : undefined;
  }
  const maybe = key as { toHex?: () => string };
  if (typeof maybe.toHex === 'function') {
    try {
      const h = maybe.toHex();
      if (typeof h === 'string' && /^[0-9a-fA-F]{64}$/.test(h)) return h;
    } catch {
      /* fall through */
    }
  }
  return undefined;
}

export async function fetchAllEvonodeBlocks(
  sdk: Pick<EvoSDK, 'epoch'>,
  epoch: number,
  execution: Pick<SdkQueryExecution, 'assertActive'>,
): Promise<WalkedMap<string, number>> {
  const out = new WalkedMap<string, number>();
  let cursor: string | undefined = undefined;
  for (let page = 0; page < MAX_PROPOSER_PAGES; page++) {
    execution.assertActive();
    const result = await sdk.epoch.evonodesProposedBlocksByRange({
      epoch,
      limit: PAGE_LIMIT,
      startAfter: cursor,
    });
    execution.assertActive();
    if (!(result instanceof Map) || result.size === 0) return out;
    let lastHex: string | undefined;
    for (const [key, val] of result) {
      // Display key = the SDK's map key (hex in rc.2 and 5.0, which /evonode/ links
      // accept along with base58). Pagination cursor = hex.
      const displayKey = typeof key === 'string' ? key : String(key ?? '');
      const hex = keyToHex(key);
      if (!displayKey) continue;
      const blocks = typeof val === 'bigint' ? Number(val) : Number(val ?? 0);
      if (!out.has(displayKey)) out.set(displayKey, blocks);
      if (hex) lastHex = hex;
    }
    if (!lastHex || result.size < PAGE_LIMIT) return out;
    cursor = lastHex;
  }
  out.truncated = true;
  return out;
}

export function evonodesMapToBars(
  m: unknown,
): Array<{ proTxHash: string; blocks: number }> {
  if (!m) return [];
  const entries: Array<[unknown, unknown]> = m instanceof Map ? [...m.entries()] : [];
  const out = entries
    .map(([id, blocks]) => ({
      proTxHash: typeof id === 'string' ? id : String(id ?? ''),
      blocks: typeof blocks === 'bigint' ? Number(blocks) : Number(blocks ?? 0),
    }))
    .filter((e) => e.proTxHash);
  out.sort((a, b) => b.blocks - a.blocks || (a.proTxHash < b.proTxHash ? -1 : a.proTxHash > b.proTxHash ? 1 : 0));
  return out;
}

export interface ProposerSummary {
  bars: Array<{ proTxHash: string; blocks: number }>;
  totalBlocks: number;
  proposers: number;
}

/** Ranked proposers plus the totals the ranking was taken from. Only
 *  meaningful for a complete proposer map (finalized record or full walk). */
export function summariseProposers(m: unknown): ProposerSummary {
  const bars = evonodesMapToBars(m);
  return {
    bars,
    totalBlocks: bars.reduce((sum, e) => sum + e.blocks, 0),
    proposers: bars.length,
  };
}

/** Fills the end time and progress of an epoch whose record has only a start
 *  time (the current epoch) from the network's configured epoch length. The
 *  real boundary is the first block after start + duration, so the end is an
 *  estimate. */
export function withEpochDuration(
  epoch: NormalisedEpoch,
  durationMs: number | null,
  now = Date.now(),
): NormalisedEpoch {
  if (epoch.endAtMs !== null || epoch.startAtMs === null || !durationMs || durationMs <= 0) {
    return epoch;
  }
  const endAtMs = epoch.startAtMs + durationMs;
  const pct = ((now - epoch.startAtMs) / durationMs) * 100;
  return { ...epoch, endAtMs, progressPct: Math.min(100, Math.max(0, pct)) };
}

export interface ProposerStanding {
  blocks: number;
  /** Competition rank: 1 + proposers with strictly more blocks. */
  rank: number;
  proposers: number;
  totalBlocks: number;
  topBlocks: number;
}

/** One proposer's position in a complete proposer map keyed by canonical
 *  hex proTxHash. Null when the proposer has no blocks in the map. */
export function proposerStanding(m: Map<string, number>, hex: string): ProposerStanding | null {
  const blocks = m.get(hex);
  if (blocks === undefined) return null;
  let ahead = 0;
  let totalBlocks = 0;
  let topBlocks = 0;
  for (const b of m.values()) {
    if (b > blocks) ahead++;
    totalBlocks += b;
    topBlocks = Math.max(topBlocks, b);
  }
  return { blocks, rank: ahead + 1, proposers: m.size, totalBlocks, topBlocks };
}
