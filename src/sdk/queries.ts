'use client';

import {
  useQuery,
  useQueries,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { getSdkQueryKey, overlayQueryResult, useSdk, useSdkQuery as useSessionQuery, type SdkQueryExecution } from './hooks';
import { epochInfoQuery, epochRangeError, epochRangeQueries, fetchEpochRange, isEpochIndex } from './epoch-queries';
import { fetchCurrentEpoch } from './current-epoch';
import { getConfig } from '@/config';
import { classifyProof, getQuorumKeySource, isProofFallbackBlocked, verificationForResponse, type ProofState } from './proofs';
import { walkInstance } from '@util/wasm-json';
import { extractErrorMessage, isAbsentEntityError, isAllEndpointsFailure, normalizeError } from './errors';
import {
  useQueryProofRecorder,
  useQueryProofEntry,
  type ProofData,
  type QueryProofEntry,
  type ResponseMeta,
} from '@/contexts/QueryProofStore';

type Awaited<T> = T extends Promise<infer U> ? U : T;

export type SdkQueryResult<TData> = UseQueryResult<TData, Error> & {
  proofState: ProofState;
  /** The inspector entry recorded for this query (proof, metadata, result),
   *  if one has been captured. Lets a value's ProofGlyph open the inspector
   *  pre-populated with the real proof rather than an empty placeholder. */
  proofEntry?: QueryProofEntry;
};

export function shouldUseProofTransport(
  _network: string,
  trusted: boolean,
  hasProofFn: boolean,
): boolean {
  // Proof transport is gated on trusted mode only. Devnets used to be
  // force-routed through the proof variants because they had no other way to
  // attach a context; dev.7's `EvoSDK.devnetTrusted()` makes them the same
  // as any other network — proof variant iff `trusted` is on.
  return hasProofFn && trusted;
}

interface SdkQueryOpts<TData>
  extends Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'> {
  /** Does the underlying SDK method expose a `…WithProof` sibling? Defaults to true. */
  hasProofVariant?: boolean;
  /** If provided, called instead of `fn` when trusted mode is on.
   *  Returns ProofMetadataResponse; `.data` is unwrapped as the query result,
   *  `.proof` + `.metadata` are stored in the QueryProofStore. */
  withProofFn?: (sdk: EvoSDK) => Promise<unknown>;
  /** Human-readable SDK method name shown in the inspector (e.g. "identities.fetch"). */
  methodName?: string;
  /** Parameters passed to the SDK method, shown in the inspector. */
  methodParams?: Record<string, unknown>;
  /** Limits of captured evidence for queries that combine multiple responses. */
  captureNote?: string;
}

function notFoundNote(error: unknown): string {
  return `The SDK reported no matching record: ${extractErrorMessage(error)}`;
}

function decodeChainId(raw: unknown): string {
  if (!(raw instanceof Uint8Array)) return String(raw ?? '');
  // chainId is a short ASCII identifier (e.g. "evo1"). Decode if printable,
  // otherwise fall back to hex so non-text bytes still surface.
  const printable = Array.from(raw).every((b) => b >= 0x20 && b < 0x7f);
  if (printable) return new TextDecoder('utf-8').decode(raw);
  return Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extractMetadata(meta: unknown): ResponseMeta | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const m = meta as Record<string, unknown>;
  return {
    height: Number(m.height ?? 0),
    coreChainLockedHeight: Number(m.coreChainLockedHeight ?? 0),
    epoch: Number(m.epoch ?? 0),
    timeMs: Number(m.timeMs ?? 0),
    protocolVersion: Number(m.protocolVersion ?? 0),
    chainId: decodeChainId(m.chainId),
  };
}

function extractProof(proof: unknown): ProofData | undefined {
  if (!proof || typeof proof !== 'object') return undefined;
  const p = proof as Record<string, unknown>;
  const grovedbProof = p.grovedbProof;
  if (!(grovedbProof instanceof Uint8Array) || !grovedbProof.length) return undefined;
  return {
    grovedbProof: new Uint8Array(grovedbProof),
    quorumHash: p.quorumHash instanceof Uint8Array ? new Uint8Array(p.quorumHash) : new Uint8Array(),
    signature: p.signature instanceof Uint8Array ? new Uint8Array(p.signature) : new Uint8Array(),
    round: Number(p.round ?? 0),
    blockIdHash: p.blockIdHash instanceof Uint8Array ? new Uint8Array(p.blockIdHash) : new Uint8Array(),
    quorumType: Number(p.quorumType ?? 0),
  };
}

/**
 * Core hook: runs a query against the current SDK only when it is ready,
 * and annotates the return with a `proofState` derived from (a) whether
 * the underlying facade method has a proof variant and (b) the current
 * trusted flag. Every cache key is prefixed with (network, trusted, session).
 *
 * When trusted mode is on, this hook
 * REPLACES the regular `fn` call with `withProofFn` (the `*WithProof`
 * facade variant) and stores the returned proof + metadata in the
 * QueryProofStore when the inspector is enabled.
 */
function useSdkQuery<TData>(
  key: readonly unknown[],
  fn: (sdk: EvoSDK, execution: SdkQueryExecution) => Promise<TData>,
  opts?: SdkQueryOpts<TData>,
): SdkQueryResult<TData> {
  const context = useSdk();
  const { network, trusted, quorumUrl } = context;
  const { hasProofVariant = true, withProofFn, methodName, methodParams, captureNote, ...rest } = opts ?? {};
  const proofStore = useQueryProofRecorder();
  const fullKey = getSdkQueryKey(context, key);
  const storeKey = JSON.stringify(fullKey);
  const proofEntry = useQueryProofEntry(storeKey);

  const q = useSessionQuery<TData>(key, async (sdk, execution) => {
    const { assertActive } = execution;
    const generation = proofStore.generation;
    const inspectorMethodName = methodName ?? `${String(key[0])}.${String(key[1])}`;
    const quorumKeySource = getQuorumKeySource(network, quorumUrl);
    const t0 = performance.now();
    const record = (
      status: 'success' | 'error',
      outcome: Partial<Pick<QueryProofEntry, 'result' | 'metadata' | 'proof' | 'error' | 'proofCaptureError' | 'captureNote'>>,
      error?: unknown,
    ) => {
      assertActive();
      if (!proofStore.enabled || proofStore.generation !== generation) return;
      const timestamp = Date.now();
      const durationMs = Math.round(performance.now() - t0);
      let result: unknown;
      let resultCaptureError: string | undefined;
      if (status === 'success') {
        try { result = safeSerialize(outcome.result ?? null); }
        catch (snapshotError) { resultCaptureError = extractErrorMessage(snapshotError); }
      }
      proofStore.record(storeKey, {
        queryKey: fullKey,
        methodName: inspectorMethodName,
        methodParams: methodParams ?? {},
        hasProofVariant,
        network,
        trusted,
        quorumKeySource,
        verification: verificationForResponse({ trusted, hasProofVariant, status, error }),
        timestamp,
        durationMs,
        status,
        captureNote: status === 'success' ? captureNote : undefined,
        ...outcome,
        result,
        resultCaptureError,
      }, generation);
    };

    // Ordinary trusted methods also verify internally. Capturing bytes is only
    // useful when the inspector is enabled and does not change the trust policy.
    if (proofStore.enabled && shouldUseProofTransport(network, trusted, !!withProofFn)) {
      try {
        const response = (await withProofFn!(sdk)) as
          | { data?: unknown; metadata?: unknown; proof?: unknown }
          | undefined;
        assertActive();
        if (!response || typeof response !== 'object') {
          throw new Error('Proof capture returned no response.');
        }
        const data = response?.data;
        record('success', {
          result: data,
          metadata: extractMetadata(response?.metadata),
          proof: extractProof(response?.proof),
        });
        return (data ?? null) as TData;
      } catch (error) {
        assertActive();
        const captureError = extractErrorMessage(error);
        if (isAbsentEntityError(error)) {
          record('success', { result: null, captureNote: notFoundNote(error) });
          return null as TData;
        }
        if (isProofFallbackBlocked(error)) {
          record('error', { error: captureError }, error);
          // Never retry native proof errors, including decoding/context errors.
          throw normalizeError(error);
        }
        // A capture/transport failure may retry through the same trusted SDK's
        // ordinary method, which still verifies its response internally.
        try {
          const result = await fn(sdk, execution);
          assertActive();
          record('success', { result, proofCaptureError: captureError });
          return (result ?? null) as TData;
        } catch (fallbackError) {
          assertActive();
          if (isAbsentEntityError(fallbackError)) {
            record('success', { result: null, proofCaptureError: captureError, captureNote: notFoundNote(fallbackError) });
            return null as TData;
          }
          record('error', { error: extractErrorMessage(fallbackError), proofCaptureError: captureError }, fallbackError);
          throw normalizeError(fallbackError);
        }
      }
    }

    try {
      const result = await fn(sdk, execution);
      assertActive();
      record('success', { result });
      return (result ?? null) as TData;
    } catch (error) {
      assertActive();
      if (isAbsentEntityError(error)) {
        // The SDK raises these kinds (EpochNotFound, …) when the requested entity
        // is absent; pages render their not-found state for null.
        record('success', { result: null, captureNote: notFoundNote(error) });
        return null as TData;
      }
      record('error', { error: extractErrorMessage(error) }, error);
      throw normalizeError(error);
    }
  }, rest);
  // RQ's stock `isLoading` is `isPending && isFetching`, so it goes false the
  // moment a query is gated off — including the SDK-boot window when the
  // internal gate above forces `enabled: false`. The common pattern
  // `if (isLoading) <Loading /> else if (data.length === 0) <Empty />` would
  // then flash the empty state before any fetch is attempted. Override to:
  // "loading whenever the caller asked for data but none has arrived". Queries
  // the *caller* explicitly disables stay non-loading so they don't spin
  // forever waiting for a precondition the user hasn't met yet. A failed SDK
  // session surfaces as an error from the session query instead.
  const userEnabled = typeof rest.enabled === 'boolean' ? rest.enabled : true;
  const proofState = classifyProof(q, { hasProofVariant });
  return overlayQueryResult(q, { proofState, proofEntry, isLoading: q.isPending && userEnabled }) as SdkQueryResult<TData>;
}

function identifierLeaf(value: object): unknown {
  const candidate = value as { __type?: unknown; toJSON?: () => unknown };
  let type: unknown;
  try { type = candidate.__type; }
  catch { return undefined; } // The walker skips unreadable prototype getters.
  if (type !== 'Identifier') return undefined;
  const serialized = candidate.toJSON?.();
  // rc.2 Identifier.toJSON() is canonical Base58, including 32 ones for zero.
  if (typeof serialized !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(serialized)) {
    throw new Error('SDK Identifier did not return a canonical JSON string.');
  }
  return serialized;
}

/**
 * Snapshot a query result for the inspector. Preserve native Identifier leaves
 * before surfacing other WASM state through getters and `getFoo()` methods.
 * Maps/Uint8Arrays/BigInts are then converted to JSON-friendly forms.
 */
function safeSerialize(value: unknown): unknown {
  const walked = walkInstance(value, 0, identifierLeaf);
  return jsonFriendly(walked);
}

function jsonFriendly(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) {
    return Array.from(value).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Map/Set are passed through walkInstance unchanged (it does not recurse
  // into Map values), so we walk each entry here to surface WASM getter state
  // on the values.
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => { obj[String(k)] = safeSerialize(v); });
    return obj;
  }
  if (value instanceof Set) return [...value].map(safeSerialize);
  if (Array.isArray(value)) return value.map(jsonFriendly);
  if (typeof value === 'object') {
    const plain: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      plain[k] = jsonFriendly((value as Record<string, unknown>)[k]);
    }
    return plain;
  }
  return value;
}

// ----- staleTime conventions from PRD §11.2 -----
const STRUCTURAL = 5 * 60_000; // 5 min (contract schema, identity keys)
const LIVE = 30_000; // 30 s (balances, status)
const IMMUTABLE = Infinity; // deterministic validation, finalized epoch

// ----- identities -----
export function useIdentity(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'fetch', id],
    (sdk) => sdk.identities.fetch(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.identities.fetchWithProof(id!), methodName: 'identities.fetch', methodParams: { identityId: id } },
  );
}

export function useIdentityBalanceAndRevision(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'balanceAndRevision', id],
    (sdk) => sdk.identities.balanceAndRevision(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE, withProofFn: (sdk) => sdk.identities.balanceAndRevisionWithProof(id!), methodName: 'identities.balanceAndRevision', methodParams: { identityId: id } },
  );
}

export function useIdentityKeys(id: string | undefined) {
  const query = { identityId: id!, request: { type: 'all' as const } };
  return useSdkQuery(
    ['identities', 'getKeys', id],
    (sdk) => sdk.identities.getKeys(query) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.identities.getKeysWithProof(query), methodName: 'identities.getKeys', methodParams: { identityId: id } },
  );
}

export function useIdentityNonce(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'nonce', id],
    (sdk) => sdk.identities.nonce(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE, withProofFn: (sdk) => sdk.identities.nonceWithProof(id!), methodName: 'identities.nonce', methodParams: { identityId: id } },
  );
}

export function useIdentityContractNonce(id: string | undefined, contractId: string | undefined) {
  return useSdkQuery(
    ['identities', 'contractNonce', id, contractId],
    (sdk) => sdk.identities.contractNonce(id!, contractId!) as Promise<unknown>,
    { enabled: !!id && !!contractId, staleTime: LIVE, withProofFn: (sdk) => sdk.identities.contractNonceWithProof(id!, contractId!), methodName: 'identities.contractNonce', methodParams: { identityId: id, contractId } },
  );
}

/** Keys the identity has bound to a contract (encryption / decryption keys
 *  with contract bounds). Empty when it has none. */
export function useIdentityContractKeys(id: string | undefined, contractId: string | undefined) {
  const query = { identityIds: [id!], contractId: contractId! };
  return useSdkQuery(
    ['identities', 'contractKeys', id, contractId],
    (sdk) => sdk.identities.contractKeys(query) as Promise<unknown>,
    { enabled: !!id && !!contractId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.identities.contractKeysWithProof(query), methodName: 'identities.contractKeys', methodParams: { identityIds: [id], contractId } },
  );
}

export function useIdentityByPublicKeyHash(pkh: string | undefined) {
  return useSdkQuery(
    ['identities', 'byPublicKeyHash', pkh],
    (sdk) => sdk.identities.byPublicKeyHash(pkh!) as Promise<unknown>,
    { enabled: !!pkh, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.identities.byPublicKeyHashWithProof(pkh!), methodName: 'identities.byPublicKeyHash', methodParams: { publicKeyHash: pkh } },
  );
}

export function useIdentitiesByNonUniquePkh(
  pkh: string | undefined,
  startAfter?: string,
) {
  return useSdkQuery(
    ['identities', 'byNonUniquePublicKeyHash', pkh, startAfter],
    (sdk) => sdk.identities.byNonUniquePublicKeyHash(pkh!, startAfter) as Promise<unknown>,
    { enabled: !!pkh, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.identities.byNonUniquePublicKeyHashWithProof(pkh!, startAfter), methodName: 'identities.byNonUniquePublicKeyHash', methodParams: { publicKeyHash: pkh, startAfter } },
  );
}

// ----- contracts -----
export function useContract(id: string | undefined) {
  return useSdkQuery(
    ['contracts', 'fetch', id],
    (sdk) => sdk.contracts.fetch(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.contracts.fetchWithProof(id!), methodName: 'contracts.fetch', methodParams: { contractId: id } },
  );
}

/** The (at most 10) newest stored versions of a contract that keeps history. */
export function useContractHistory(id: string | undefined) {
  return useSdkQuery(
    ['contracts', 'getHistory', id],
    (sdk) => sdk.contracts.getHistory({ dataContractId: id! }) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.contracts.getHistoryWithProof({ dataContractId: id! }), methodName: 'contracts.getHistory', methodParams: { dataContractId: id } },
  );
}

/** Contract previews for many IDs in one `contracts.getMany` request. One
 *  contract the SDK cannot decode fails the whole batch (testnet's Dashpay
 *  contract with rc.2), so a failed batch falls back to one request per ID.
 *  Values are the contract, null when absent, or the Error for that ID. */
export function useContractsPreview(ids: string[], enabled = true) {
  return useSdkQuery<Map<string, unknown>>(
    ['contracts', 'getMany', ids.join(',')],
    async (sdk, { assertActive }) => {
      try {
        return (await sdk.contracts.getMany(ids)) as Map<string, unknown>;
      } catch (error) {
        assertActive();
        if (isAllEndpointsFailure(error)) throw error;
      }
      const out = new Map<string, unknown>();
      for (const id of ids) {
        try {
          const one = await sdk.contracts.getMany([id]);
          out.set(id, one.get(id) ?? null);
        } catch (error) {
          assertActive();
          // An outage is not a per-contract result; fail the query so it retries.
          if (isAllEndpointsFailure(error)) throw error;
          out.set(id, normalizeError(error));
        }
        assertActive();
      }
      return out;
    },
    { enabled: enabled && ids.length > 0, staleTime: STRUCTURAL, methodName: 'contracts.getMany', methodParams: { contractIds: ids } },
  );
}

// ----- documents -----
export function useDocument(
  contractId: string | undefined,
  type: string | undefined,
  docId: string | undefined,
) {
  return useSdkQuery(
    ['documents', 'get', contractId, type, docId],
    (sdk) => sdk.documents.get(contractId!, type!, docId!) as Promise<unknown>,
    { enabled: !!contractId && !!type && !!docId, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.getWithProof(contractId!, type!, docId!), methodName: 'documents.get', methodParams: { contractId, documentType: type, documentId: docId } },
  );
}

/** Drive's MAX_DOCUMENT_HISTORY_FETCH_LIMIT. */
export const DOCUMENT_HISTORY_PAGE = 10;

/** Up to 10 revisions (Platform's cap) of a document whose type keeps
 *  history, oldest first after `startAfterMs`, keyed by block time (ms).
 *  Platform only stores these when `documentsKeepHistory` is set; otherwise
 *  the query fails its proof. */
export function useDocumentHistory(
  contractId: string | undefined,
  type: string | undefined,
  docId: string | undefined,
  enabled = true,
  startAfterMs = 0,
) {
  const query = { dataContractId: contractId!, documentTypeName: type!, documentId: docId!, startAtMs: startAfterMs, limit: DOCUMENT_HISTORY_PAGE };
  return useSdkQuery(
    ['documents', 'history', contractId, type, docId, startAfterMs],
    (sdk) => sdk.documents.history(query) as Promise<unknown>,
    { enabled: enabled && !!contractId && !!type && !!docId, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.historyWithProof(query), methodName: 'documents.history', methodParams: { dataContractId: contractId, documentTypeName: type, documentId: docId, startAtMs: startAfterMs, limit: DOCUMENT_HISTORY_PAGE } },
  );
}

// ----- tokens -----
export function useTokenTotalSupply(tokenId: string | undefined) {
  return useSdkQuery(
    ['tokens', 'totalSupply', tokenId],
    (sdk) => sdk.tokens.totalSupply(tokenId!) as Promise<unknown>,
    { enabled: !!tokenId, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.totalSupplyWithProof(tokenId!), methodName: 'tokens.totalSupply', methodParams: { tokenId } },
  );
}

export function useTokenStatuses(tokenIds: string[] | undefined) {
  return useSdkQuery(
    ['tokens', 'statuses', tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.statuses(tokenIds!) as Promise<unknown>,
    { enabled: !!tokenIds && tokenIds.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.statusesWithProof(tokenIds!), methodName: 'tokens.statuses', methodParams: { tokenIds } },
  );
}

export function useTokenDirectPurchasePrices(tokenIds: string[] | undefined) {
  return useSdkQuery(
    ['tokens', 'directPurchasePrices', tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.directPurchasePrices(tokenIds!) as Promise<unknown>,
    { enabled: !!tokenIds && tokenIds.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.directPurchasePricesWithProof(tokenIds!), methodName: 'tokens.directPurchasePrices', methodParams: { tokenIds } },
  );
}

export interface TokenContractInfoShape {
  readonly contractId: unknown;
  readonly tokenContractPosition: number;
}

export function useTokenContractInfo(tokenId: string | undefined) {
  return useSdkQuery<TokenContractInfoShape | null>(
    ['tokens', 'contractInfo', tokenId],
    (sdk) => sdk.tokens.contractInfo(tokenId!) as Promise<TokenContractInfoShape | null>,
    { enabled: !!tokenId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.tokens.contractInfoWithProof(tokenId!), methodName: 'tokens.contractInfo', methodParams: { tokenId } },
  );
}

export function useTokenIdentityBalances(
  identityId: string | undefined,
  tokenIds: string[] | undefined,
) {
  return useSdkQuery(
    ['tokens', 'identityBalances', identityId, tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.identityBalances(identityId!, tokenIds!) as Promise<unknown>,
    { enabled: !!identityId && !!tokenIds && tokenIds.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.identityBalancesWithProof(identityId!, tokenIds!), methodName: 'tokens.identityBalances', methodParams: { identityId, tokenIds } },
  );
}

/** Per-token identity state; rc.2 exposes only `isFrozen`. Tokens for which the
 *  identity has no stored info are absent from the map. */
export function useTokenIdentityTokenInfos(
  identityId: string | undefined,
  tokenIds: string[] | undefined,
) {
  return useSdkQuery(
    ['tokens', 'identityTokenInfos', identityId, tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.identityTokenInfos(identityId!, tokenIds!) as Promise<unknown>,
    { enabled: !!identityId && !!tokenIds && tokenIds.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.identityTokenInfosWithProof(identityId!, tokenIds!), methodName: 'tokens.identityTokenInfos', methodParams: { identityId, tokenIds } },
  );
}

export function usePerpetualDistributionLastClaim(
  identityId: string | undefined,
  tokenId: string | undefined,
  enabled = true,
) {
  return useSdkQuery(
    ['tokens', 'perpetualDistributionLastClaim', identityId, tokenId],
    (sdk) => sdk.tokens.perpetualDistributionLastClaim(identityId!, tokenId!) as Promise<unknown>,
    { enabled: enabled && !!identityId && !!tokenId, staleTime: LIVE, withProofFn: (sdk) => sdk.tokens.perpetualDistributionLastClaimWithProof(identityId!, tokenId!), methodName: 'tokens.perpetualDistributionLastClaim', methodParams: { identityId, tokenId } },
  );
}

// ----- addresses -----
export function useAddressInfo(addr: string | undefined) {
  return useSdkQuery(
    ['addresses', 'get', addr],
    (sdk) => sdk.addresses.get(addr!) as Promise<unknown>,
    { enabled: !!addr, staleTime: LIVE, withProofFn: (sdk) => sdk.addresses.getWithProof(addr!), methodName: 'addresses.get', methodParams: { address: addr } },
  );
}

// ----- dpns -----
export function useDpnsResolve(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'resolveName', name],
    (sdk) => sdk.dpns.resolveName(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL, hasProofVariant: false, methodName: 'dpns.resolveName', methodParams: { name } },
  );
}

export function useDpnsUsername(identityId: string | undefined) {
  return useSdkQuery(
    ['dpns', 'username', identityId],
    (sdk) => sdk.dpns.username(identityId!) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.dpns.usernameWithProof(identityId!), methodName: 'dpns.username', methodParams: { identityId } },
  );
}

export function useDpnsUsernames(identityId: string | undefined) {
  return useSdkQuery(
    ['dpns', 'usernames', 'byIdentity', identityId],
    (sdk) => sdk.dpns.usernames({ identityId: identityId! }) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.dpns.usernamesWithProof({ identityId: identityId! }), methodName: 'dpns.usernames', methodParams: { identityId } },
  );
}

export function useDpnsGetByName(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'getUsernameByName', name],
    (sdk) => sdk.dpns.getUsernameByName(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.dpns.getUsernameByNameWithProof(name!), methodName: 'dpns.getUsernameByName', methodParams: { username: name } },
  );
}

/** Strip the `.dash` TLD so we pass a bare label to SDK methods that expect one. */
function toLabel(name: string): string {
  return name.endsWith('.dash') ? name.slice(0, -5) : name;
}

export function useDpnsIsAvailable(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isNameAvailable', name],
    (sdk) => sdk.dpns.isNameAvailable(toLabel(name!)) as Promise<unknown>,
    { enabled: !!name, staleTime: LIVE, hasProofVariant: false, methodName: 'dpns.isNameAvailable', methodParams: { label: name } },
  );
}

export function useDpnsIsContested(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isContestedUsername', name],
    (sdk) => sdk.dpns.isContestedUsername(toLabel(name!)) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL, hasProofVariant: false, methodName: 'dpns.isContestedUsername', methodParams: { label: name } },
  );
}

export function useDpnsIsValid(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isValidUsername', name],
    (sdk) => sdk.dpns.isValidUsername(toLabel(name!)) as Promise<unknown>,
    { enabled: !!name, staleTime: IMMUTABLE, hasProofVariant: false, methodName: 'dpns.isValidUsername', methodParams: { label: name } },
  );
}

// ----- state transitions -----
/** How long the explorer waits for Platform to report a state transition's
 *  result. The SDK call blocks until the transition executes, so an unknown
 *  hash would otherwise spin for as long as DAPI keeps the request open. */
export const STATE_TRANSITION_WAIT_MS = 60_000;

export class StateTransitionWaitTimeout extends Error {
  override name = 'StateTransitionWaitTimeout';
}

// The SDK cannot abort a wait, so a timed-out wait keeps running. A retry
// races a fresh timer against the wait already in flight instead of opening
// another one per attempt.
const stateTransitionWaits = new WeakMap<EvoSDK, Map<string, Promise<unknown>>>();

function waitForStateTransition(sdk: EvoSDK, hash: string): Promise<unknown> {
  let waits = stateTransitionWaits.get(sdk);
  if (!waits) stateTransitionWaits.set(sdk, (waits = new Map()));
  let wait = waits.get(hash);
  if (!wait) {
    wait = sdk.stateTransitions.waitForStateTransitionResult(hash).finally(() => waits.delete(hash));
    waits.set(hash, wait);
  }
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StateTransitionWaitTimeout(
      `Platform reported no result within ${STATE_TRANSITION_WAIT_MS / 1000} s.`,
    )), STATE_TRANSITION_WAIT_MS);
    wait.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function useStateTransitionResult(hash: string | undefined) {
  return useSdkQuery(
    ['stateTransitions', 'waitForStateTransitionResult', hash],
    (sdk) => waitForStateTransition(sdk, hash!),
    // Each attempt can take the full wait; the page offers Retry instead.
    { enabled: !!hash, staleTime: LIVE, retry: false, hasProofVariant: false, methodName: 'stateTransitions.waitForResult', methodParams: { hash } },
  );
}

// ----- voting (for Identity.Votes tab) -----
export function useIdentityVotes(identityId: string | undefined) {
  const query = { identityId: identityId! };
  return useSdkQuery(
    ['voting', 'contestedResourceIdentityVotes', identityId],
    (sdk) => sdk.voting.contestedResourceIdentityVotes(query) as Promise<unknown>,
    { enabled: !!identityId, staleTime: LIVE, withProofFn: (sdk) => sdk.voting.contestedResourceIdentityVotesWithProof(query), methodName: 'voting.contestedResourceIdentityVotes', methodParams: { identityId } },
  );
}

// ----- groups (for Identity.Groups + Contract.Groups tabs) -----
export function useIdentityGroups(identityId: string | undefined) {
  const query = { identityId: identityId! };
  return useSdkQuery(
    ['group', 'identityGroups', identityId],
    (sdk) => sdk.group.identityGroups(query) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.group.identityGroupsWithProof(query), methodName: 'group.identityGroups', methodParams: { identityId } },
  );
}

export function useGroupsDataContracts(contractIds: string[] | undefined) {
  return useSdkQuery(
    ['group', 'groupsDataContracts', contractIds?.join(',') ?? ''],
    (sdk) => sdk.group.groupsDataContracts(contractIds!) as Promise<unknown>,
    { enabled: !!contractIds && contractIds.length > 0, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.group.groupsDataContractsWithProof(contractIds!), methodName: 'group.groupsDataContracts', methodParams: { contractIds } },
  );
}

// ----- documents.query (the one true list primitive) -----
export interface DocumentsQueryParams {
  dataContractId: string;
  documentTypeName: string;
  where?: unknown[];
  orderBy?: Array<[string, 'asc' | 'desc']>;
  limit?: number;
  startAfter?: string;
  /** SQL-shaped GROUP BY field list. Ignored on the regular `query` path,
   *  honored by the documents count / sum / average aggregates. */
  groupBy?: string[];
}

export function useDocumentsQuery(
  params: DocumentsQueryParams | undefined,
  executionId?: string | number,
) {
  const key = params
    ? [
        params.dataContractId,
        params.documentTypeName,
        JSON.stringify(params.where ?? []),
        JSON.stringify(params.orderBy ?? []),
        params.limit ?? 25,
        params.startAfter ?? '',
      ]
    : [];
  return useSdkQuery(
    ['documents', 'query', ...key, ...(executionId === undefined ? [] : ['execution', executionId])],
    (sdk) => sdk.documents.query(params as never) as Promise<unknown>,
    { enabled: !!params, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.queryWithProof(params as never), methodName: 'documents.query', methodParams: params ? { dataContractId: params.dataContractId, documentTypeName: params.documentTypeName, where: params.where, orderBy: params.orderBy, limit: params.limit, startAfter: params.startAfter } : {} },
  );
}

// ----- documents aggregates (count / sum / average) -----
//
// The pinned SDK's documents facade exposes count / sum / average and their
// `…WithProof` variants, so trusted runs verify the response and the
// inspector captures its proof like any other query.

export type AggregateKind = 'count' | 'sum' | 'avg';

export interface CountSumPair {
  count: bigint;
  sum: bigint;
}

const AGGREGATE_METHODS: Record<AggregateKind, 'count' | 'sum' | 'average'> = {
  count: 'count',
  sum: 'sum',
  avg: 'average',
};

export type DocumentsAggregateResult = Map<string, bigint | CountSumPair>;

/** Run a count / sum / average aggregate. Pass `undefined` for `params` or
 *  `kind` to keep the hook idle. `field` names the integer property to
 *  aggregate for SUM/AVG and is ignored for COUNT. */
export function useDocumentsAggregate(
  params: DocumentsQueryParams | undefined,
  kind: AggregateKind | undefined,
  field: string | undefined,
  executionId?: string | number,
) {
  const needsField = kind === 'sum' || kind === 'avg';
  const enabled = !!params && !!kind && (!needsField || !!field);
  const methodName = kind ? `documents.${AGGREGATE_METHODS[kind]}` : 'documents.aggregate';
  const query = params as never;
  const methodParams = {
    ...((params ?? {}) as Record<string, unknown>),
    ...(needsField ? { [kind === 'sum' ? 'sumProperty' : 'averageProperty']: field } : {}),
  };
  return useSdkQuery<DocumentsAggregateResult>(
    [
      'documents',
      'aggregate',
      kind ?? '',
      params?.dataContractId ?? '',
      params?.documentTypeName ?? '',
      JSON.stringify(params?.where ?? []),
      JSON.stringify(params?.orderBy ?? []),
      JSON.stringify(params?.groupBy ?? []),
      params?.limit ?? '',
      field ?? '',
      ...(executionId === undefined ? [] : ['execution', executionId]),
    ],
    async (sdk) => {
      switch (kind!) {
        case 'count': return sdk.documents.count(query);
        case 'sum':   return sdk.documents.sum(query, field!);
        case 'avg':   return sdk.documents.average(query, field!);
      }
    },
    {
      enabled,
      staleTime: LIVE,
      withProofFn: async (sdk) => {
        switch (kind!) {
          case 'count': return sdk.documents.countWithProof(query);
          case 'sum':   return sdk.documents.sumWithProof(query, field!);
          case 'avg':   return sdk.documents.averageWithProof(query, field!);
        }
      },
      methodName,
      methodParams,
    },
  );
}

export function useTokenHistoryDirectPurchases(
  tokenHistoryContractId: string | undefined,
  limit = 25,
  startAfter?: string,
) {
  const queryParams = {
    dataContractId: tokenHistoryContractId!,
    documentTypeName: 'directPurchase',
    where: [['purchaseCost', '>=', 0]],
    orderBy: [['purchaseCost', 'asc']],
    limit,
    startAfter,
  } as never;
  return useSdkQuery(
    ['documents', 'query', 'tokenHistory', 'directPurchase', tokenHistoryContractId, limit, startAfter ?? ''],
    (sdk) => sdk.documents.query(queryParams) as Promise<unknown>,
    { enabled: !!tokenHistoryContractId, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.queryWithProof(queryParams), methodName: 'documents.query', methodParams: { dataContractId: tokenHistoryContractId, documentTypeName: 'directPurchase', limit, startAfter } },
  );
}

export function useDpnsPrefixSearch(
  prefix: string | undefined,
  dpnsContractId: string | undefined,
  limit = 25,
  startAfter?: string,
) {
  const normalized = prefix?.trim() ?? '';
  const hasContract = !!dpnsContractId;
  const hasPrefix = normalized.length > 0;
  const queryParams = {
    dataContractId: dpnsContractId!,
    documentTypeName: 'domain',
    where: [
      ['normalizedParentDomainName', '==', 'dash'],
      ['normalizedLabel', 'startsWith', normalized],
    ],
    orderBy: [['normalizedLabel', 'asc']],
    limit,
    startAfter,
  } as never;
  return useSdkQuery(
    ['documents', 'query', 'dpnsPrefix', dpnsContractId, normalized, limit, startAfter ?? ''],
    (sdk) => sdk.documents.query(queryParams) as Promise<unknown>,
    { enabled: hasContract && hasPrefix, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.queryWithProof(queryParams), methodName: 'documents.query', methodParams: { dataContractId: dpnsContractId, documentTypeName: 'domain', prefix: normalized, limit, startAfter } },
  );
}

// ----- epoch -----
export function useCurrentEpoch() {
  const { network, trusted } = useSdk();
  return useSdkQuery(
    ['epoch', 'current'],
    (sdk, execution) => fetchCurrentEpoch(sdk, network, trusted, execution),
    {
      staleTime: LIVE,
      methodName: 'epoch.epochsInfo',
      methodParams: { selection: 'genesis-and-time', network, ascending: true, count: 1 },
      captureNote: `Current epoch selected from separate ${trusted ? 'SDK-verified explicit queries and signed block time' : 'SDK calls and the local clock'}. No single proof payload or response height covers this selection.`,
    },
  );
}

export function useEpochInfo(index: number | undefined) {
  const valid = isEpochIndex(index);
  const query = valid ? epochInfoQuery(index) : undefined;
  return useSdkQuery(
    ['epoch', 'epochsInfo', index],
    (sdk) => sdk.epoch.epochsInfo(epochInfoQuery(index!)) as Promise<unknown>,
    { enabled: valid, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.epoch.epochsInfoWithProof(epochInfoQuery(index!)), methodName: 'epoch.epochsInfo', methodParams: query ? { ...query } : {} },
  );
}

export function useEpochRange(from: number | undefined, to: number | undefined) {
  const { trusted } = useSdk();
  const valid = epochRangeError(from, to) === null;
  const batches = valid ? epochRangeQueries(from!, to!) : [];
  return useSdkQuery(
    ['epoch', 'epochsInfo', from, to],
    (sdk, execution) => fetchEpochRange(sdk, from!, to!, execution),
    {
      enabled: valid,
      staleTime: STRUCTURAL,
      methodName: 'epoch.epochsInfo',
      methodParams: { requestedRange: { from, to }, plannedBatches: batches },
      captureNote: `Combined results from separate ${trusted ? 'SDK-verified batches' : 'SDK calls'}. No single proof payload or response height covers this range.`,
    },
  );
}

export function useFinalizedEpochInfo(index: number | undefined) {
  const valid = isEpochIndex(index);
  const query = valid ? epochInfoQuery(index) : undefined;
  return useSdkQuery(
    ['epoch', 'finalizedInfos', index],
    (sdk) => sdk.epoch.finalizedInfos(epochInfoQuery(index!)) as Promise<unknown>,
    {
      enabled: valid,
      // A finalized record is immutable; its absence is not. A mounted detail
      // page must notice when an unfinalized epoch acquires a finalized record.
      staleTime: (q) => q.state.data instanceof Map && q.state.data.get(index) != null ? IMMUTABLE : LIVE,
      refetchInterval: (q) => q.state.data instanceof Map && q.state.data.get(index) == null ? LIVE : false,
      withProofFn: (sdk) => sdk.epoch.finalizedInfosWithProof(epochInfoQuery(index!)),
      methodName: 'epoch.finalizedInfos', methodParams: query ? { ...query } : {},
    },
  );
}

/** Every proposer in an epoch (pages of 100 walked by proTxHash). A single
 *  page is a proTxHash-ordered slice, so rankings must use this walk. Only
 *  the current epoch has live proposer data; finalized epochs carry theirs in
 *  `finalizedInfos().blockProposers`. */
export function useAllEvonodeBlocksInEpoch(epoch: number | undefined) {
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', 'all', epoch],
    async (sdk, execution) => {
      const { fetchAllEvonodeBlocks } = await import('@util/epoch');
      return fetchAllEvonodeBlocks(sdk, epoch!, execution);
    },
    {
      enabled: epoch !== undefined, staleTime: LIVE, methodName: 'epoch.evonodesProposedBlocksByRange', methodParams: { epoch, paginated: true },
      captureNote: 'Combined results from separate paginated SDK calls. No single proof payload or response height covers the whole walk.',
    },
  );
}

export function useEvonodesBlocksByIds(epoch: number | undefined, ids: string[] | undefined) {
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByIds', epoch, ids?.join(',') ?? ''],
    (sdk) => sdk.epoch.evonodesProposedBlocksByIds(epoch!, ids!) as Promise<unknown>,
    { enabled: epoch !== undefined && !!ids && ids.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.epoch.evonodesProposedBlocksByIdsWithProof(epoch!, ids!), methodName: 'epoch.evonodesProposedBlocksByIds', methodParams: { epoch, ids } },
  );
}

// ----- system -----
export function useSystemStatus() {
  return useSdkQuery(
    ['system', 'status'],
    (sdk) => sdk.system.status() as Promise<unknown>,
    { staleTime: LIVE, refetchInterval: LIVE, hasProofVariant: false, methodName: 'system.status', methodParams: {} },
  );
}

export function useCurrentQuorumsInfo() {
  return useSdkQuery(
    ['system', 'currentQuorumsInfo'],
    (sdk) => sdk.system.currentQuorumsInfo() as Promise<unknown>,
    { staleTime: LIVE, hasProofVariant: false, methodName: 'system.currentQuorumsInfo', methodParams: {} },
  );
}

export function useTotalCreditsInPlatform() {
  return useSdkQuery(
    ['system', 'totalCreditsInPlatform'],
    (sdk) => sdk.system.totalCreditsInPlatform() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.system.totalCreditsInPlatformWithProof(), methodName: 'system.totalCreditsInPlatform', methodParams: {} },
  );
}

export function usePrefundedSpecializedBalance(id: string | undefined) {
  return useSdkQuery(
    ['system', 'prefundedSpecializedBalance', id],
    (sdk) => sdk.system.prefundedSpecializedBalance(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE, withProofFn: (sdk) => sdk.system.prefundedSpecializedBalanceWithProof(id!), methodName: 'system.prefundedSpecializedBalance', methodParams: { identityId: id } },
  );
}

export function usePathElements(
  path: string[] | undefined,
  keys: string[] | undefined,
) {
  const enabled =
    Array.isArray(path) && path.length > 0 && Array.isArray(keys) && keys.length > 0;
  return useSdkQuery(
    ['system', 'pathElements', JSON.stringify(path ?? []), JSON.stringify(keys ?? [])],
    (sdk) => sdk.system.pathElements(path!, keys!) as Promise<unknown>,
    { enabled, staleTime: LIVE, withProofFn: (sdk) => sdk.system.pathElementsWithProof(path!, keys!), methodName: 'system.pathElements', methodParams: { path, keys } },
  );
}

// ----- shielded pool -----
export function useShieldedPoolState() {
  return useSdkQuery(
    ['shielded', 'poolState'],
    (sdk) => sdk.shielded.poolState() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.shielded.poolStateWithProof(), methodName: 'shielded.poolState', methodParams: {} },
  );
}

export function useShieldedMostRecentAnchor() {
  return useSdkQuery(
    ['shielded', 'mostRecentAnchor'],
    (sdk) => sdk.shielded.mostRecentAnchor() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.shielded.mostRecentAnchorWithProof(), methodName: 'shielded.mostRecentAnchor', methodParams: {} },
  );
}

/** Every currently valid anchor; Platform returns the whole set at once. */
export function useShieldedAnchors() {
  return useSdkQuery(
    ['shielded', 'anchors'],
    (sdk) => sdk.shielded.anchors() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.shielded.anchorsWithProof(), methodName: 'shielded.anchors', methodParams: {} },
  );
}

/** Spent status for 32-byte nullifiers, given as hex. */
export function useShieldedNullifiers(nullifiersHex: string[] | undefined) {
  const bytes = () => nullifiersHex!.map((hex) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16))));
  return useSdkQuery(
    ['shielded', 'nullifiers', nullifiersHex?.join(',') ?? ''],
    (sdk) => sdk.shielded.nullifiers(bytes()) as Promise<unknown>,
    { enabled: !!nullifiersHex && nullifiersHex.length > 0, staleTime: LIVE, withProofFn: (sdk) => sdk.shielded.nullifiersWithProof(bytes()), methodName: 'shielded.nullifiers', methodParams: { nullifiers: nullifiersHex } },
  );
}

/** Encrypted notes from `startIndex`. The proof verifier needs `startIndex` to
 *  be a multiple of the per-query cap (`SHIELDED_NOTES_WINDOW`). */
export function useShieldedEncryptedNotes(startIndex: number | undefined, count: number) {
  return useSdkQuery(
    ['shielded', 'encryptedNotes', startIndex, count],
    (sdk) => sdk.shielded.encryptedNotes(BigInt(startIndex!), count) as Promise<unknown>,
    { enabled: startIndex !== undefined, staleTime: LIVE, withProofFn: (sdk) => sdk.shielded.encryptedNotesWithProof(BigInt(startIndex!), count), methodName: 'shielded.encryptedNotes', methodParams: { startIndex, count } },
  );
}

// ----- protocol -----
export function useProtocolVersionUpgradeState() {
  return useSdkQuery(
    ['protocol', 'versionUpgradeState'],
    (sdk) => sdk.protocol.versionUpgradeState() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.protocol.versionUpgradeStateWithProof(), methodName: 'protocol.versionUpgradeState', methodParams: {} },
  );
}

export function useProtocolVersionUpgradeVoteStatus(
  startProTxHash: string | undefined,
  count: number,
  enabled = true,
) {
  return useSdkQuery(
    ['protocol', 'versionUpgradeVoteStatus', startProTxHash ?? '', count],
    (sdk) => sdk.protocol.versionUpgradeVoteStatus(startProTxHash, count) as Promise<unknown>,
    { enabled, staleTime: LIVE, withProofFn: (sdk) => sdk.protocol.versionUpgradeVoteStatusWithProof(startProTxHash, count), methodName: 'protocol.versionUpgradeVoteStatus', methodParams: { startProTxHash, count } },
  );
}

/** Every masternode's protocol vote (hex proTxHash → version), walked in
 *  pages of 100. */
export function useAllProtocolVotes() {
  return useSdkQuery(
    ['protocol', 'versionUpgradeVoteStatus', 'all'],
    async (sdk, execution) => {
      const { fetchAllProtocolVotes } = await import('@util/protocol-votes');
      return fetchAllProtocolVotes(sdk, execution);
    },
    {
      staleTime: LIVE, methodName: 'protocol.versionUpgradeVoteStatus', methodParams: { paginated: true, count: 100 },
      captureNote: 'Combined results from separate paginated SDK calls. No single proof payload or response height covers the whole walk.',
    },
  );
}

// ----- voting polls -----
// NOTE: VotePollsByEndDateQuery is currently un-callable from JS in
// @dashevo/wasm-sdk 3.1.0-dev.* because of a deserializer/validator
// Catch-22 in packages/wasm-sdk/src/queries/voting/polls.rs:
//   - the Rust field is `start_time_ms: Option<f64>`, and serde-wasm-bindgen
//     routes a fractionless JS Number through the integer visitor, which
//     the f64 deserializer rejects with `invalid type: integer …, expected f64`;
//   - any fractional Number that passes the deserializer is then rejected
//     downstream by `if raw.fract() != 0.0 { … "must be an integer value" }`.
// There is no JS value (integer Number, BigInt, string, Float64Array,
// Math.fround, etc.) that the SDK accepts. Track the upstream fix; until
// then this hook is expected to error.
export function useVotePollsByEndDate(startDateMs?: number, endDateMs?: number, enabled = true) {
  const query = { startTimeMs: startDateMs, endTimeMs: endDateMs };
  return useSdkQuery(
    ['voting', 'votePollsByEndDate', startDateMs ?? 0, endDateMs ?? 0],
    (sdk) => sdk.voting.votePollsByEndDate(query) as Promise<unknown>,
    { enabled, staleTime: LIVE, withProofFn: (sdk) => sdk.voting.votePollsByEndDateWithProof(query), methodName: 'voting.votePollsByEndDate', methodParams: { startDateMs, endDateMs } },
  );
}

// ----- group contested resources + info -----
export function useContestedResources(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
  startIndexValues?: unknown[],
) {
  const query = {
    dataContractId: contractId!,
    documentTypeName: documentTypeName!,
    indexName: indexName!,
    ...(startIndexValues ? { startIndexValues } : {}),
    limit: 100,
  };
  return useSdkQuery(
    ['group', 'contestedResources', contractId, documentTypeName, indexName, JSON.stringify(startIndexValues ?? [])],
    (sdk) => sdk.group.contestedResources(query) as Promise<unknown>,
    { enabled: !!contractId && !!documentTypeName && !!indexName, staleTime: LIVE, withProofFn: (sdk) => sdk.group.contestedResourcesWithProof(query), methodName: 'group.contestedResources', methodParams: { contractId, documentTypeName, indexName, startIndexValues } },
  );
}

export function useGroupInfos(contractId: string | undefined) {
  const query = { dataContractId: contractId! };
  return useSdkQuery(
    ['group', 'infos', contractId],
    (sdk) => sdk.group.infos(query) as Promise<unknown>,
    { enabled: !!contractId, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.group.infosWithProof(query), methodName: 'group.infos', methodParams: { dataContractId: contractId } },
  );
}

export function useGroupInfo(contractId: string | undefined, position: number | undefined) {
  return useSdkQuery(
    ['group', 'info', contractId, position],
    (sdk) => sdk.group.info(contractId!, position!) as Promise<unknown>,
    { enabled: !!contractId && position !== undefined, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.group.infoWithProof(contractId!, position!), methodName: 'group.info', methodParams: { contractId, groupContractPosition: position } },
  );
}

export function useGroupMembers(contractId: string | undefined, position: number | undefined) {
  const query = { dataContractId: contractId!, groupContractPosition: position! };
  return useSdkQuery(
    ['group', 'members', contractId, position],
    (sdk) => sdk.group.members(query) as Promise<unknown>,
    { enabled: !!contractId && position !== undefined, staleTime: LIVE, withProofFn: (sdk) => sdk.group.membersWithProof(query), methodName: 'group.members', methodParams: { dataContractId: contractId, groupContractPosition: position } },
  );
}

export function useGroupActions(
  contractId: string | undefined,
  position: number | undefined,
  status: 'ACTIVE' | 'CLOSED' = 'ACTIVE',
) {
  const query = { dataContractId: contractId!, groupContractPosition: position!, status };
  return useSdkQuery(
    ['group', 'actions', contractId, position, status],
    (sdk) => sdk.group.actions(query) as Promise<unknown>,
    { enabled: !!contractId && position !== undefined, staleTime: LIVE, withProofFn: (sdk) => sdk.group.actionsWithProof(query), methodName: 'group.actions', methodParams: { dataContractId: contractId, groupContractPosition: position, status } },
  );
}

/** Members who signed a group action, with the power each contributed. */
export function useGroupActionSigners(
  contractId: string | undefined,
  position: number | undefined,
  status: 'ACTIVE' | 'CLOSED',
  actionId: string | undefined,
) {
  const query = { dataContractId: contractId!, groupContractPosition: position!, status, actionId: actionId! };
  return useSdkQuery(
    ['group', 'actionSigners', contractId, position, status, actionId],
    (sdk) => sdk.group.actionSigners(query) as Promise<unknown>,
    { enabled: !!contractId && position !== undefined && !!actionId, staleTime: LIVE, withProofFn: (sdk) => sdk.group.actionSignersWithProof(query), methodName: 'group.actionSigners', methodParams: { dataContractId: contractId, groupContractPosition: position, status, actionId } },
  );
}

export function useContestedResourceVoteState(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
  indexValues: unknown[] | undefined,
) {
  const query = {
    dataContractId: contractId!,
    documentTypeName: documentTypeName!,
    indexName: indexName!,
    indexValues: indexValues!,
  };
  return useSdkQuery(
    ['voting', 'contestedResourceVoteState', contractId, documentTypeName, indexName, JSON.stringify(indexValues ?? [])],
    (sdk) => sdk.voting.contestedResourceVoteState(query) as Promise<unknown>,
    { enabled: !!contractId && !!documentTypeName && !!indexName && !!indexValues, staleTime: LIVE, withProofFn: (sdk) => sdk.voting.contestedResourceVoteStateWithProof(query), methodName: 'voting.contestedResourceVoteState', methodParams: { contractId, documentTypeName, indexName, indexValues } },
  );
}

/** Masternode voter identities that voted for one contender, a page at a
 *  time. Platform deletes these votes once the contest is decided. */
export function useContestedResourceVoters(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
  indexValues: unknown[] | undefined,
  contestantId: string | undefined,
  startAfterVoterId?: string,
  limit = 50,
) {
  const query = {
    dataContractId: contractId!,
    documentTypeName: documentTypeName!,
    indexName: indexName!,
    indexValues: indexValues!,
    contestantId: contestantId!,
    limit,
    ...(startAfterVoterId ? { startAtVoterId: startAfterVoterId, startAtIncluded: false } : {}),
  };
  return useSdkQuery(
    ['group', 'contestedResourceVotersForIdentity', contractId, documentTypeName, indexName, JSON.stringify(indexValues ?? []), contestantId, startAfterVoterId ?? '', limit],
    (sdk) => sdk.group.contestedResourceVotersForIdentity(query) as Promise<unknown>,
    { enabled: !!contractId && !!documentTypeName && !!indexName && !!indexValues && !!contestantId, staleTime: LIVE, withProofFn: (sdk) => sdk.group.contestedResourceVotersForIdentityWithProof(query), methodName: 'group.contestedResourceVotersForIdentity', methodParams: { contractId, documentTypeName, indexName, indexValues, contestantId, startAfterVoterId, limit } },
  );
}

// ----- DASH/USD rate -----
export function useDashUsdRate() {
  const config = getConfig();
  return useQuery<{ price: number; fetchedAt: number; source: string } | null, Error>({
    queryKey: ['npe', 'rate', config.rateProvider],
    queryFn: async () => {
      if (config.rateProvider === 'none') return null;
      const { fetchDashUsdRate } = await import('@util/rate');
      return fetchDashUsdRate(config.rateProvider);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export { useQueries, type Awaited };
