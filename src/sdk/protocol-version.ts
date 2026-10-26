import type { EvoSDK } from '@dashevo/evo-sdk';
import { toPlain } from '@util/contract';

function positiveInteger(value: unknown): number | null {
  const n = typeof value === 'bigint' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Platform protocol version the responding node currently runs
 *  (`status.version.protocol.drive.current`). */
export function networkProtocolVersion(status: unknown): number | null {
  const plain = toPlain(status) as { version?: { protocol?: { drive?: { current?: unknown } } } } | null | undefined;
  return positiveInteger(plain?.version?.protocol?.drive?.current);
}

/** Protocol version the session builds and verifies with (`sdk.version()`). */
export function sessionProtocolVersion(sdk: Pick<EvoSDK, 'version'> | null | undefined): number | null {
  try {
    return positiveInteger(sdk?.version());
  } catch {
    // A freed or disconnected session.
    return null;
  }
}

/**
 * Since evo-sdk 5.0 a session detects the network's protocol version, but
 * only upward: it starts at a per-network floor (13 for mainnet and testnet,
 * 14 for devnets), or at the version it persisted for mainnet and testnet,
 * ratchets up after proved answers, and never steps down.
 *  - `network-newer`: the network runs a version newer than the bundled SDK
 *    supports (`EvoSDK.getLatestVersionNumber()`), so the session cannot follow.
 *  - `network-older`: the network runs a version older than the session
 *    already uses (e.g. a devnet still on 13), which the session cannot undo.
 * A session below a supported network version is not a mismatch for display:
 * it catches up with the first proved read.
 */
export type ProtocolVersionMismatch = 'network-newer' | 'network-older' | null;

export function protocolVersionMismatch(
  latestSupported: number | null,
  session: number | null,
  network: number | null,
): ProtocolVersionMismatch {
  if (network === null) return null;
  if (latestSupported !== null && network > latestSupported) return 'network-newer';
  if (session !== null && network < session) return 'network-older';
  return null;
}

/**
 * Writes build state transitions with the session's protocol rules (contract
 * serialization, nonce-derived document ids), so they must match the version
 * the network runs. That version is read from a proved response's metadata:
 * the quorum signature binds it and the SDK rejects stale nodes, unlike an
 * unproved `system.status` from whichever node answers. The same proved read
 * brings a session still at the network floor up to date, so `sdk.version()`
 * is compared after it. Returns the checked version; throws a plain Error the
 * caller reports as "not submitted".
 */
export async function assertWritableProtocolVersion(
  sdk: Pick<EvoSDK, 'version' | 'system'>,
): Promise<number> {
  let metadata: { protocolVersion?: unknown } | undefined;
  try {
    metadata = (await sdk.system.totalCreditsInPlatformWithProof())?.metadata;
  } catch (error) {
    throw new Error(
      'Could not read the protocol version the network runs, so the operation was not built. ' +
        'Check the connection and try again.',
      { cause: error },
    );
  }
  const network = positiveInteger(metadata?.protocolVersion);
  const session = sessionProtocolVersion(sdk);
  if (network === null || session === null) {
    throw new Error(
      'Could not confirm the protocol version the network runs, so the operation was not built. ' +
        'Try again; if this persists, reconnect from Settings.',
    );
  }
  if (session === network) return session;
  if (session > network) {
    throw new Error(
      `This network runs Platform protocol v${network}, but the SDK session uses v${session} ` +
        'and cannot step down to an older protocol. A transaction built now would follow ' +
        `v${session} rules (data contract format, document ids), so writes are disabled on this ` +
        'network. If the network was reset, clear the SDK cache in Settings → Connection.',
    );
  }
  throw new Error(
    `This network runs Platform protocol v${network}, but the SDK session uses v${session}. ` +
      `A transaction built now would follow v${session} rules, so it was not built. The ` +
      'bundled SDK does not support this protocol yet.',
  );
}
