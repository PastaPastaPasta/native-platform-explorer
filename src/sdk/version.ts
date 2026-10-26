'use client';

import { useQuery } from '@tanstack/react-query';
import { toPlain } from '@util/contract';
import { useSdk } from './hooks';
import { useSystemStatus } from './queries';

/** Platform protocol version the responding node currently runs
 *  (`status.version.protocol.drive.current`). */
export function networkProtocolVersion(status: unknown): number | null {
  const plain = toPlain(status) as { version?: { protocol?: { drive?: { current?: unknown } } } } | null | undefined;
  const current = plain?.version?.protocol?.drive?.current;
  const n = typeof current === 'bigint' ? Number(current) : current;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

export interface ProtocolVersionCheck {
  /** Newest Platform protocol version the bundled SDK supports
   *  (`EvoSDK.getLatestVersionNumber()`). */
  sdkVersion: number | null;
  networkVersion: number | null;
  /** The network runs a protocol newer than the bundled SDK supports. */
  mismatch: boolean;
}

/**
 * PRD §11.7 version check. Since evo-sdk 5.0 a session detects the network's
 * protocol version from its responses (`sdk.version()` starts at the
 * network's floor and rises after the first proved answer), so it follows an
 * older network on its own. What it cannot follow is a network newer than the
 * newest version it was built with, so that is the comparison made here.
 * Shares the polled `system.status` query, so it adds no network requests.
 */
export function useProtocolVersionCheck(): ProtocolVersionCheck {
  const { status } = useSdk();
  const statusQ = useSystemStatus();
  const latestQ = useQuery({
    queryKey: ['sdk', 'latestProtocolVersion'],
    queryFn: async () => {
      const { EvoSDK } = await import('@dashevo/evo-sdk');
      return EvoSDK.getLatestVersionNumber();
    },
    // The WASM module is initialized once a session is ready, so this reads
    // a constant without loading anything.
    enabled: status === 'ready',
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const latest = latestQ.data;
  const sdkVersion = typeof latest === 'number' && Number.isInteger(latest) ? latest : null;
  const networkVersion = status === 'ready' ? networkProtocolVersion(statusQ.data) : null;
  return {
    sdkVersion,
    networkVersion,
    mismatch: sdkVersion !== null && networkVersion !== null && networkVersion > sdkVersion,
  };
}
