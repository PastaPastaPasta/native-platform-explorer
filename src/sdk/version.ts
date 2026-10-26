'use client';

import { useQuery } from '@tanstack/react-query';
import { useSdk } from './hooks';
import { useSystemStatus } from './queries';
import {
  networkProtocolVersion,
  protocolVersionMismatch,
  sessionProtocolVersion,
  type ProtocolVersionMismatch,
} from './protocol-version';

export { networkProtocolVersion } from './protocol-version';

export interface ProtocolVersionCheck {
  /** Newest Platform protocol version the bundled SDK supports
   *  (`EvoSDK.getLatestVersionNumber()`). */
  sdkVersion: number | null;
  /** Protocol version this SDK session currently uses (`sdk.version()`). */
  sessionVersion: number | null;
  networkVersion: number | null;
  mismatch: ProtocolVersionMismatch;
}

/**
 * PRD §11.7 version check. Since evo-sdk 5.0 a session detects the network's
 * protocol version from its responses, but only upward (see
 * `protocolVersionMismatch`). So it warns when the network is newer than the
 * bundled SDK supports, or older than the version the session already uses.
 * Shares the polled `system.status` query, so it adds no network requests;
 * each poll re-reads the session's version.
 */
export function useProtocolVersionCheck(): ProtocolVersionCheck {
  const { sdk, status } = useSdk();
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
  const ready = status === 'ready';
  const networkVersion = ready ? networkProtocolVersion(statusQ.data) : null;
  const sessionVersion = ready ? sessionProtocolVersion(sdk) : null;
  return {
    sdkVersion,
    sessionVersion,
    networkVersion,
    mismatch: protocolVersionMismatch(sdkVersion, sessionVersion, networkVersion),
  };
}
