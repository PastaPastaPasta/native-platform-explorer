import type { EvoSDK } from '@dashevo/evo-sdk';
import { extractErrorMessage } from './errors';

// evo-sdk 5.0 builds document queries from a cached data contract, which it
// also persists in localStorage (`dash-sdk.contracts.<network>`, mainnet and
// testnet only) and only refreshes when a returned document is stamped with a
// newer contract version. A type or index added on chain after caching makes
// the query fail locally with one of these messages (wasm-sdk's
// "Document type not found", Drive's QuerySyntaxError texts) until the
// contract is fetched again.
const STALE_CONTRACT_MESSAGE =
  /document type not found|where clause on non indexed property|query is too far from index|query on document type with no indexes|invalid order by properties/i;

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
    let refreshed: unknown;
    try {
      refreshed = await sdk.contracts.fetch(contractId);
    } catch {
      throw error;
    }
    if (!refreshed) throw error;
    return read();
  }
}

/** The SDK's persisted contract maps (wasm-sdk `contract_store`). */
const PERSISTED_CONTRACT_KEYS = ['dash-sdk.contracts.mainnet', 'dash-sdk.contracts.testnet'];

/**
 * Remove the SDK's persisted contracts and return how many there were. A
 * running session keeps its in-memory copies; reconnect so the next session
 * starts with an empty cache.
 */
export function clearPersistedContracts(storage: Storage = window.localStorage): number {
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
  return count;
}
