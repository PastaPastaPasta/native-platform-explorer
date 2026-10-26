import type { EvoSDK } from '@dashevo/evo-sdk';
import { extractErrorMessage } from './errors';

// evo-sdk 5.0 builds document queries from a cached data contract, which it
// also persists in localStorage (`dash-sdk.contracts.<network>`, mainnet and
// testnet only) and only refreshes when a returned document is stamped with a
// newer contract version. A document type added on chain after caching makes
// get/history fail with wasm-sdk's "Document type not found: …" and queries
// and aggregates with DataContractError's "document type not found: …" until
// the contract is fetched again. Indexes of an existing type cannot change
// on chain, so index errors never mean a stale contract.
const STALE_CONTRACT_MESSAGE = /document type not found/i;

export function isStaleContractError(error: unknown): boolean {
  return STALE_CONTRACT_MESSAGE.test(extractErrorMessage(error));
}

/**
 * Run a document read. If it fails as if the cached contract were stale,
 * fetch the contract once (`contracts.fetch` replaces an older cached and
 * persisted version) and run the read once more. Otherwise, or when the
 * contract cannot be fetched, the original error is thrown.
 */
export async function withContractRefresh<T>(
  sdk: Pick<EvoSDK, 'contracts'>,
  contractId: string,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isStaleContractError(error)) throw error;
    const refreshed = await sdk.contracts.fetch(contractId).catch(() => null);
    if (!refreshed) throw error;
    return read();
  }
}

/** What the SDK persists per network (wasm-sdk `contract_store` and
 *  `protocol_version_store`). The protocol version only ratchets upward, so
 *  after a network reset it must be cleared for a session to follow it. */
const PERSISTED_CONTRACT_KEYS = ['dash-sdk.contracts.mainnet', 'dash-sdk.contracts.testnet'];
const PERSISTED_VERSION_KEYS = ['dash-sdk.protocol-version.mainnet', 'dash-sdk.protocol-version.testnet'];

/**
 * Remove the SDK's persisted contracts and protocol versions, returning how
 * many contracts there were. A running session keeps its in-memory state;
 * reconnect so the next session starts fresh.
 */
export function clearPersistedSdkCache(storage: Storage = window.localStorage): number {
  let count = 0;
  for (const key of PERSISTED_CONTRACT_KEYS) {
    try {
      const stored = JSON.parse(storage.getItem(key) ?? '{}') as unknown;
      if (stored && typeof stored === 'object') count += Object.keys(stored).length;
    } catch {
      /* unreadable entry: removed below */
    }
    storage.removeItem(key);
  }
  for (const key of PERSISTED_VERSION_KEYS) storage.removeItem(key);
  return count;
}
