import { describe, expect, it } from 'vitest';
import {
  computeNetworkHealth,
  extractPlatformStatus,
  type PlatformStatus,
} from '../health';
import type { CoreStatus } from '@util/insight';

function platform(over: Partial<PlatformStatus> = {}): PlatformStatus {
  return {
    latestBlockHeight: 402,
    coreChainLockedHeight: 9755,
    latestBlockMs: null,
    nodeLocalMs: null,
    latestBlockHash: null,
    chainId: null,
    isCatchingUp: false,
    isListening: true,
    peers: 5,
    proTxHash: null,
    ...over,
  };
}

function core(blocks: number, blockTimeMs: number | null = null): CoreStatus {
  return { blocks, blockTimeMs, fetchedAt: 0 };
}

describe('extractPlatformStatus', () => {
  it('reads the last-block time from time.block (ms), not chain.*', () => {
    const raw = {
      toJSON: () => ({
        chain: { latestBlockHeight: 402, coreChainLockedHeight: 9755, isCatchingUp: false },
        network: { chainId: 'evo1', peersCount: 5, isListening: true },
        time: { local: '1780067894', block: '1780014886480', genesis: '0', epoch: 0 },
      }),
    };
    const s = extractPlatformStatus(raw);
    expect(s.latestBlockHeight).toBe(402);
    expect(s.coreChainLockedHeight).toBe(9755);
    // time.block is unix ms; time.local is unix seconds → coerced to ms.
    expect(s.latestBlockMs).toBe(1780014886480);
    expect(s.nodeLocalMs).toBe(1780067894 * 1000);
    expect(s.chainId).toBe('evo1');
  });

  it('tolerates a missing status payload', () => {
    const s = extractPlatformStatus(undefined);
    expect(s.latestBlockHeight).toBeNull();
    expect(s.coreChainLockedHeight).toBeNull();
    expect(s.latestBlockMs).toBeNull();
  });
});

describe('computeNetworkHealth', () => {
  it('is healthy when Core tracks the chainlock and blocks are recent', () => {
    const now = Date.now();
    const h = computeNetworkHealth(
      platform({ coreChainLockedHeight: 10690, latestBlockMs: now - 5_000, nodeLocalMs: now }),
      core(10692),
    );
    expect(h.level).toBe('healthy');
    expect(h.coreLag).toBe(2);
    expect(h.reasons).toHaveLength(0);
  });

  it('flags stale when Core has run far ahead of the chainlock (the incident)', () => {
    // Mirrors the partition: Core ~10690, Platform pinned at chainlock 9755,
    // last Platform block ~15h stale relative to the node clock.
    const local = 1780067894 * 1000;
    const block = 1780014886480;
    const h = computeNetworkHealth(
      platform({ coreChainLockedHeight: 9755, latestBlockMs: block, nodeLocalMs: local }),
      core(10690),
    );
    expect(h.level).toBe('stale');
    expect(h.coreLag).toBe(935);
    expect(h.reasons.length).toBeGreaterThan(0);
  });

  it('uses the node clock, not the browser clock, for block age', () => {
    // Block 1h old by the node's clock → degraded, regardless of Date.now().
    const local = 5_000_000_000_000;
    const h = computeNetworkHealth(
      platform({ latestBlockMs: local - 60 * 60_000, nodeLocalMs: local }),
      null,
    );
    expect(h.lastBlockAgeMs).toBe(60 * 60_000);
    expect(h.level).toBe('degraded');
  });

  it('reports unknown when no signal is available', () => {
    const h = computeNetworkHealth(
      platform({ coreChainLockedHeight: null, latestBlockMs: null, nodeLocalMs: null }),
      null,
    );
    expect(h.level).toBe('unknown');
    expect(h.insightAvailable).toBe(false);
  });

  it('still judges block age when Insight is unavailable', () => {
    const now = Date.now();
    const h = computeNetworkHealth(
      platform({ latestBlockMs: now - 10_000, nodeLocalMs: now }),
      null,
    );
    expect(h.level).toBe('healthy');
    expect(h.coreLag).toBeNull();
  });
});
