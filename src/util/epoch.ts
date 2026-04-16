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
