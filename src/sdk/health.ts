'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSdk } from './hooks';
import { useSystemStatus } from './queries';
import { getNetwork } from './networks';
import { toPlain } from '@util/contract';
import { fetchCoreStatus, type CoreStatus } from '@util/insight';

// ----- field extraction from system.status() -----

function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n =
      typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v as string);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Tolerant timestamp coercion. Accepts number/bigint (seconds or ms, detected
 *  by magnitude), numeric string, or ISO 8601. Returns ms or null. */
export function asMs(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const iso = Date.parse(v);
    if (Number.isFinite(iso) && /[-T:]/.test(v)) return iso;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n < 1e11 ? n * 1000 : n;
  }
  const n = firstNum(v);
  if (n === null) return null;
  return n < 1e11 ? n * 1000 : n;
}

export interface PlatformStatus {
  latestBlockHeight: number | null;
  /** Highest Core block height this Platform node has chain-locked. Pinned
   *  when Platform consensus stalls even though Core keeps advancing. */
  coreChainLockedHeight: number | null;
  /** Tenderdash latest block time (ms) — from status.time.block. */
  latestBlockMs: number | null;
  /** The responding node's wall-clock (ms) — from status.time.local. Used as
   *  the staleness reference so client clock skew doesn't skew the verdict. */
  nodeLocalMs: number | null;
  latestBlockHash: string | null;
  chainId: string | null;
  isCatchingUp: boolean;
  isListening: boolean;
  peers: number | null;
  proTxHash: string | null;
}

/** Normalise the nested WASM `StatusResponse` into the flat fields we display
 *  and reason about. The real shape is `{ chain, network, version, node,
 *  stateSync, time }`; the last-block timestamp lives in `time.block` (not
 *  `chain.*`), which earlier reads missed. */
export function extractPlatformStatus(raw: unknown): PlatformStatus {
  const plain = (raw ? ((toPlain(raw) as Record<string, unknown>) ?? {}) : {}) as Record<
    string,
    unknown
  >;
  const chain = (plain.chain as Record<string, unknown> | undefined) ?? {};
  const network = (plain.network as Record<string, unknown> | undefined) ?? {};
  const node = (plain.node as Record<string, unknown> | undefined) ?? {};
  const time = (plain.time as Record<string, unknown> | undefined) ?? {};

  return {
    latestBlockHeight: firstNum(
      chain.latestBlockHeight,
      chain.blockHeight,
      chain.height,
      plain.height,
    ),
    coreChainLockedHeight: firstNum(
      chain.coreChainLockedHeight,
      chain.coreChainLocked,
      plain.coreChainLockedHeight,
    ),
    latestBlockMs: asMs(
      time.block ??
        chain.latestBlockTime ??
        chain.blockTime ??
        plain.latestBlockTime ??
        plain.blockTime,
    ),
    nodeLocalMs: asMs(time.local ?? plain.local),
    latestBlockHash: (chain.latestBlockHash ?? plain.latestBlockHash ?? null) as string | null,
    chainId: (network.chainId ?? plain.chainId ?? null) as string | null,
    peers: firstNum(network.peersCount, plain.peersCount),
    isListening: Boolean(network.isListening ?? plain.isListening),
    isCatchingUp: Boolean(chain.isCatchingUp ?? plain.isCatchingUp),
    proTxHash: (node.proTxHash ?? plain.proTxHash ?? null) as string | null,
  };
}

// ----- health verdict -----

export type HealthLevel = 'healthy' | 'degraded' | 'stale' | 'unknown';

/** Platform last-block age past which we flag a problem (ms). Tenderdash should
 *  produce blocks on a steady cadence; a multi-minute gap is the first hint of a
 *  consensus stall, hours confirms it. */
const BLOCK_AGE_DEGRADED_MS = 30 * 60_000;
const BLOCK_AGE_STALE_MS = 2 * 60 * 60_000;

/** Gap between Core's tip (Insight) and the height Platform has chain-locked.
 *  Healthy lag is a handful of blocks; hundreds means Platform is following a
 *  frozen view of Core. */
export const CORE_LAG_DEGRADED = 4;
export const CORE_LAG_STALE = 16;

export interface NetworkHealth {
  level: HealthLevel;
  /** Platform's Tenderdash block height. */
  platformHeight: number | null;
  /** Platform's chain-locked Core height. */
  coreChainLockedHeight: number | null;
  /** Core tip height from Insight, when available. */
  coreHeight: number | null;
  /** coreHeight − coreChainLockedHeight, when both known. */
  coreLag: number | null;
  /** Platform last-block age (ms), measured against the node's own clock. */
  lastBlockAgeMs: number | null;
  /** Whether an Insight endpoint was configured + reachable for this network. */
  insightAvailable: boolean;
  /** Human-readable reasons backing a degraded/stale verdict. */
  reasons: string[];
}

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  const rank: Record<HealthLevel, number> = { healthy: 0, degraded: 1, stale: 2, unknown: -1 };
  if (rank[a] === -1) return b;
  if (rank[b] === -1) return a;
  return rank[a] >= rank[b] ? a : b;
}

export function computeNetworkHealth(
  platform: PlatformStatus,
  core: CoreStatus | null,
): NetworkHealth {
  const reasons: string[] = [];

  // Reference "now" from the node's own clock when present (avoids client clock
  // skew); otherwise fall back to the browser clock.
  const referenceNow = platform.nodeLocalMs ?? Date.now();
  const lastBlockAgeMs =
    platform.latestBlockMs !== null ? Math.max(0, referenceNow - platform.latestBlockMs) : null;

  let blockLevel: HealthLevel = 'unknown';
  if (lastBlockAgeMs !== null) {
    if (lastBlockAgeMs >= BLOCK_AGE_STALE_MS) {
      blockLevel = 'stale';
      reasons.push(`Last Platform block was ${formatAge(lastBlockAgeMs)} ago`);
    } else if (lastBlockAgeMs >= BLOCK_AGE_DEGRADED_MS) {
      blockLevel = 'degraded';
      reasons.push(`Last Platform block was ${formatAge(lastBlockAgeMs)} ago`);
    } else {
      blockLevel = 'healthy';
    }
  }

  let coreLevel: HealthLevel = 'unknown';
  let coreLag: number | null = null;
  if (core && platform.coreChainLockedHeight !== null) {
    coreLag = core.blocks - platform.coreChainLockedHeight;
    if (coreLag >= CORE_LAG_STALE) {
      coreLevel = 'stale';
      reasons.push(
        `Core is ${coreLag} blocks ahead of Platform's chain-locked height (Core ${core.blocks} vs ${platform.coreChainLockedHeight})`,
      );
    } else if (coreLag >= CORE_LAG_DEGRADED) {
      coreLevel = 'degraded';
      reasons.push(
        `Core is ${coreLag} blocks ahead of Platform's chain-locked height`,
      );
    } else {
      coreLevel = 'healthy';
    }
  }

  return {
    level: worst(blockLevel, coreLevel),
    platformHeight: platform.latestBlockHeight,
    coreChainLockedHeight: platform.coreChainLockedHeight,
    coreHeight: core?.blocks ?? null,
    coreLag,
    lastBlockAgeMs,
    insightAvailable: core !== null,
    reasons,
  };
}

function formatAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// ----- hooks -----

/** Layer-1 Core tip from the current network's Insight API. Disabled (and
 *  reported as unavailable) for networks with no `insightApiUrl`, e.g. devnets. */
export function useCoreStatus() {
  const { network } = useSdk();
  const insightApiUrl = getNetwork(network).insightApiUrl;
  return useQuery<CoreStatus | null, Error>({
    queryKey: ['npe', network, 'core-status'],
    queryFn: ({ signal }) => fetchCoreStatus(insightApiUrl!, signal),
    enabled: !!insightApiUrl,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** Combined Platform-vs-Core health verdict. */
export function useNetworkHealth(): NetworkHealth {
  const statusQ = useSystemStatus();
  const coreQ = useCoreStatus();

  return useMemo(() => {
    const platform = extractPlatformStatus(statusQ.data);
    return computeNetworkHealth(platform, coreQ.data ?? null);
  }, [statusQ.data, coreQ.data]);
}
