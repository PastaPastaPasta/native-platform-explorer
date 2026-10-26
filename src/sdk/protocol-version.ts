import type { EvoSDK } from '@dashevo/evo-sdk';
import { toPlain } from '@util/contract';

/** Platform protocol version the responding node currently runs
 *  (`status.version.protocol.drive.current`). */
export function networkProtocolVersion(status: unknown): number | null {
  const plain = toPlain(status) as { version?: { protocol?: { drive?: { current?: unknown } } } } | null | undefined;
  const current = plain?.version?.protocol?.drive?.current;
  const n = typeof current === 'bigint' ? Number(current) : current;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Protocol version the session builds and verifies with (`sdk.version()`). */
export function sessionProtocolVersion(sdk: Pick<EvoSDK, 'version'> | null | undefined): number | null {
  try {
    const n = sdk?.version();
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    // A freed or disconnected session.
    return null;
  }
}

/**
 * Since evo-sdk 5.0 a session detects the network's protocol version, but
 * only upward: it starts at a per-network floor (13 for mainnet and testnet,
 * 14 for devnets), ratchets up after proved answers, and never steps down.
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
 * the network runs. Call after the operation's proved reads, which bring a
 * session that started at the network floor up to date. Returns the checked
 * version; throws a plain Error the caller reports as "not submitted".
 */
export async function assertWritableProtocolVersion(
  sdk: Pick<EvoSDK, 'version' | 'system'>,
): Promise<number> {
  let status: unknown;
  try {
    status = await sdk.system.status();
  } catch (error) {
    throw new Error(
      'Could not read the protocol version the network runs, so the operation was not built. ' +
        'Check the connection and try again.',
      { cause: error },
    );
  }
  const network = networkProtocolVersion(status);
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
        'network until it upgrades or the explorer bundles an SDK that matches it.',
    );
  }
  throw new Error(
    `This network runs Platform protocol v${network}, but the SDK session uses v${session}. ` +
      `A transaction built now would follow v${session} rules, so it was not built. If the ` +
      'network has just upgraded, try again; otherwise the bundled SDK does not support this ' +
      'protocol yet.',
  );
}
