import { readProp } from './sdk-shape';

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

export function normaliseEpoch(input: unknown): NormalisedEpoch {
  const idx =
    toNumber(readProp(input, 'index')) ??
    toNumber(readProp(input, 'number')) ??
    toNumber(readProp(input, 'epochIndex')) ??
    0;
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

// Server caps limit at 100 per request. When we need every proposer in an
// epoch (e.g. to compute rank + share for a single evonode), walk pages via
// `startAfter` until we've seen every entry. Hard-capped to prevent runaway
// calls on pathologically large epochs.
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

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
  sdk: {
    epoch: {
      evonodesProposedBlocksByRange: (q: {
        epoch: number;
        limit?: number;
        startAfter?: string;
      }) => Promise<Map<unknown, unknown>>;
    };
  },
  epoch: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let cursor: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await sdk.epoch.evonodesProposedBlocksByRange({
      epoch,
      limit: PAGE_LIMIT,
      startAfter: cursor,
    });
    if (!(result instanceof Map) || result.size === 0) break;
    let lastHex: string | undefined;
    for (const [key, val] of result) {
      // Display key = base58 (what Identifier components render and what
      // /evonode/?proTxHash=… URLs use). Pagination cursor = hex.
      const displayKey = typeof key === 'string' ? key : String(key ?? '');
      const hex = keyToHex(key);
      if (!displayKey) continue;
      const blocks = typeof val === 'bigint' ? Number(val) : Number(val ?? 0);
      if (!out.has(displayKey)) out.set(displayKey, blocks);
      if (hex) lastHex = hex;
    }
    if (!lastHex || result.size < PAGE_LIMIT) break;
    cursor = lastHex;
  }
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
  out.sort((a, b) => b.blocks - a.blocks);
  return out;
}
