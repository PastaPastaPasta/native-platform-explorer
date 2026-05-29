// Fetch Layer-1 (Core) chain state from a Dash Insight API. Used to cross-check
// Platform/DAPI status against the chain Platform is supposed to be following:
// if Core keeps advancing while Platform's `coreChainLockedHeight` stays pinned,
// Platform consensus is stalled even though the L1 chain is alive.
//
// Returns null on any failure — callers must degrade gracefully (Insight is not
// configured for every network, and the endpoint may be unreachable).

export interface CoreStatus {
  /** Current Core block height (tip). */
  blocks: number;
  /** Tip block timestamp in ms, when the endpoint reports it. */
  blockTimeMs: number | null;
  fetchedAt: number;
}

function normalizeBase(insightApiUrl: string): string {
  return insightApiUrl.replace(/\/+$/, '');
}

/** `/blocks?limit=1` returns the most recent block(s) with both height and
 *  time (unix seconds) — the cheapest way to confirm Core is *moving*, not just
 *  reachable. */
async function fetchLatestBlock(
  base: string,
  signal?: AbortSignal,
): Promise<{ blocks: number; blockTimeMs: number | null } | null> {
  try {
    const res = await fetch(`${base}/blocks?limit=1`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      blocks?: Array<{ height?: number; time?: number }>;
    };
    const top = json?.blocks?.[0];
    if (!top || typeof top.height !== 'number' || !Number.isFinite(top.height)) {
      return null;
    }
    const timeMs =
      typeof top.time === 'number' && Number.isFinite(top.time) ? top.time * 1000 : null;
    return { blocks: top.height, blockTimeMs: timeMs };
  } catch {
    return null;
  }
}

/** `/status?q=getInfo` gives the tip height without a timestamp — a fallback for
 *  Insight deployments where `/blocks` is unavailable. */
async function fetchInfoHeight(base: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(`${base}/status?q=getInfo`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { info?: { blocks?: number } };
    const n = json?.info?.blocks;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function fetchCoreStatus(
  insightApiUrl: string,
  signal?: AbortSignal,
): Promise<CoreStatus | null> {
  const base = normalizeBase(insightApiUrl);

  const block = await fetchLatestBlock(base, signal);
  if (block) return { ...block, fetchedAt: Date.now() };

  const height = await fetchInfoHeight(base, signal);
  if (height !== null) return { blocks: height, blockTimeMs: null, fetchedAt: Date.now() };

  return null;
}
