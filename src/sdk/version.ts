'use client';

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
  /** Protocol version the SDK session speaks (`sdk.version()`). */
  sdkVersion: number | null;
  networkVersion: number | null;
  mismatch: boolean;
}

/**
 * PRD §11.7 version check. `sdk.version()` returns the Platform *protocol*
 * version the SDK was built for (12 for evo-sdk 4.0.0-rc.2), not the npm
 * package version, so it is compared with the protocol version the network
 * reports. Shares the polled `system.status` query, so it adds no requests.
 */
export function useProtocolVersionCheck(): ProtocolVersionCheck {
  const { sdk, status } = useSdk();
  const statusQ = useSystemStatus();
  let sdkVersion: number | null = null;
  if (status === 'ready' && sdk) {
    try {
      const v = sdk.version();
      sdkVersion = typeof v === 'number' && Number.isInteger(v) ? v : null;
    } catch {
      sdkVersion = null;
    }
  }
  const networkVersion = status === 'ready' ? networkProtocolVersion(statusQ.data) : null;
  return {
    sdkVersion,
    networkVersion,
    mismatch: sdkVersion !== null && networkVersion !== null && sdkVersion !== networkVersion,
  };
}
