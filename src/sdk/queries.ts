'use client';

import { useRef } from 'react';
import {
  useQuery,
  useQueries,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { useSdk } from './hooks';
import { getConfig } from '@/config';
import { classifyProof, type ProofState } from './proofs';
import { walkInstance, safeStringify } from '@util/wasm-json';
import {
  useQueryProofStore,
  type ProofData,
  type ResponseMeta,
} from '@/contexts/QueryProofStore';

type Awaited<T> = T extends Promise<infer U> ? U : T;

export type SdkQueryResult<TData> = UseQueryResult<TData, Error> & {
  proofState: ProofState;
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
  /** If provided, called instead of `fn` when trusted mode + inspector are on.
   *  Returns ProofMetadataResponse; `.data` is unwrapped as the query result,
   *  `.proof` + `.metadata` are stored in the QueryProofStore. */
  withProofFn?: (sdk: EvoSDK) => Promise<unknown>;
  /** Human-readable SDK method name shown in the inspector (e.g. "identities.fetch"). */
  methodName?: string;
  /** Parameters passed to the SDK method, shown in the inspector. */
  methodParams?: Record<string, unknown>;
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

/**
 * Pull a human-readable message out of an SDK error. The WASM SDK throws
 * objects like WasmSdkError / ConsensusError / WasmDppError that are NOT
 * Error instances and whose state (message, code, kind, name) lives behind
 * prototype getters. `String(err)` on them returns "[object Object]", which
 * is why the Query Inspector used to show that for failures. `walkInstance`
 * reads the getters; we then format the most useful fields into one line.
 */
function extractErrorMessage(err: unknown): string {
  if (err === null || err === undefined) return String(err);
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err !== 'object') return String(err);
  try {
    const walked = walkInstance(err) as Record<string, unknown>;
    const ctorName = (err as { constructor?: { name?: string } }).constructor?.name;
    const name = typeof walked.name === 'string' ? walked.name : undefined;
    const kind = typeof walked.kind === 'string' ? walked.kind : undefined;
    const code =
      walked.code !== undefined && walked.code !== null ? String(walked.code) : undefined;
    const message = typeof walked.message === 'string' ? walked.message : undefined;

    const label = name ?? (ctorName && ctorName !== 'Object' ? ctorName : undefined);
    const tagParts: string[] = [];
    if (label) tagParts.push(label);
    if (kind && kind !== label) tagParts.push(`(${kind})`);
    if (code) tagParts.push(`[${code}]`);
    const tag = tagParts.join(' ');

    if (message) return tag ? `${tag}: ${message}` : message;
    const dump = safeStringify(walked, 0);
    if (dump && dump !== '{}') return tag ? `${tag}: ${dump}` : dump;
    if (tag) return tag;
  } catch {
    /* fall through */
  }
  return String(err);
}

/** Wrap a thrown value in a proper Error so React Query and consumers get
 *  a usable `.message`. Keeps the original on `.cause` for debugging. */
function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  const wrapped = new Error(extractErrorMessage(err));
  (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}

function extractProof(proof: unknown): ProofData | undefined {
  if (!proof || typeof proof !== 'object') return undefined;
  const p = proof as Record<string, unknown>;
  const grovedbProof = p.grovedbProof;
  if (!(grovedbProof instanceof Uint8Array)) return undefined;
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
 * trusted flag. Every cache key is prefixed with (network, trusted).
 *
 * When the Query Inspector is enabled and trusted mode is on, this hook
 * REPLACES the regular `fn` call with `withProofFn` (the `*WithProof`
 * facade variant) and stores the returned proof + metadata in the
 * QueryProofStore. Devnets also use the proof-returning SDK methods because
 * the current WASM SDK does not implement no-proof query transport; devnet
 * results still classify as unverified because no trusted context is attached.
 */
function useSdkQuery<TData>(
  key: readonly unknown[],
  fn: (sdk: EvoSDK) => Promise<TData>,
  opts?: SdkQueryOpts<TData>,
): SdkQueryResult<TData> {
  const { sdk, status, network, trusted } = useSdk();
  const { hasProofVariant = true, withProofFn, methodName, methodParams, ...rest } = opts ?? {};
  const proofStore = useQueryProofStore();

  // Mirror the context's sdk onto a ref so queryFn (which runs async, outside
  // the render cycle) can poll it. This prevents the "SDK not ready" cold-load
  // error: on reload, a query's `enabled` flip and its `queryFn` execution
  // can race, where queryFn closes over a pre-connect `sdk = null` and throws
  // immediately. Polling the ref lets us wait for the SDK instead.
  const sdkRef = useRef<EvoSDK | null>(sdk);
  sdkRef.current = sdk;

  const proofStoreRef = useRef(proofStore);
  proofStoreRef.current = proofStore;

  const fullKey = ['npe', network, trusted, ...key] as const;

  const q = useQuery<TData, Error>({
    queryKey: fullKey,
    queryFn: async () => {
      if (!sdkRef.current) {
        // Poll the ref for up to 15s waiting for SdkProvider.connect() to
        // finish. This is a safety net: the `enabled` gate above should
        // already prevent entry until the SDK is ready.
        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (sdkRef.current) break;
        }
        if (!sdkRef.current) {
          throw new Error(
            'SDK did not become ready within 15s. Check your network connection or DAPI endpoints.',
          );
        }
      }

      const store = proofStoreRef.current;
      const storeKey = JSON.stringify(fullKey);
      const useProofTransport = shouldUseProofTransport(network, trusted, !!withProofFn);
      const inspectorMethodName = methodName ?? `${String(key[0])}.${String(key[1])}`;
      const t0 = performance.now();

      if (useProofTransport) {
        try {
          const response = (await withProofFn!(sdkRef.current)) as
            | { data?: unknown; metadata?: unknown; proof?: unknown }
            | undefined;
          const elapsed = performance.now() - t0;
          const data = response?.data;
          if (store.enabled) {
            store.record(storeKey, {
              queryKey: fullKey,
              methodName: inspectorMethodName,
              methodParams: methodParams ?? {},
              hasProofVariant: true,
              timestamp: Date.now(),
              durationMs: Math.round(elapsed),
              status: 'success',
              result: safeSerialize(data),
              metadata: extractMetadata(response?.metadata),
              proof: extractProof(response?.proof),
            });
          }
          return (data ?? null) as TData;
        } catch (err) {
          const proofError = extractErrorMessage(err);
          console.error(`[NPE] ${inspectorMethodName} failed:`, proofError, err);
          // Fall back to the non-proof variant so the explorer still works.
          // Record the entry as a success (data was retrieved) but include the
          // proof-capture error so the inspector can show both: "data succeeded,
          // but proof was not captured because ...".
          try {
            const result = await fn(sdkRef.current!);
            const elapsed = performance.now() - t0;
            if (store.enabled) {
              store.record(storeKey, {
                queryKey: fullKey,
                methodName: inspectorMethodName,
                methodParams: methodParams ?? {},
                hasProofVariant: true,
                timestamp: Date.now(),
                durationMs: Math.round(elapsed),
                status: 'success',
                result: safeSerialize(result),
                error: `Proof capture failed: ${proofError}`,
              });
            }
            return (result ?? null) as TData;
          } catch (fallbackErr) {
            const fallbackMsg = extractErrorMessage(fallbackErr);
            console.error(
              `[NPE] ${inspectorMethodName} fallback failed:`,
              fallbackMsg,
              fallbackErr,
            );
            if (store.enabled) {
              const elapsed = performance.now() - t0;
              store.record(storeKey, {
                queryKey: fullKey,
                methodName: inspectorMethodName,
                methodParams: methodParams ?? {},
                hasProofVariant: true,
                timestamp: Date.now(),
                durationMs: Math.round(elapsed),
                status: 'error',
                error: `Proof: ${proofError} | Fallback: ${fallbackMsg}`,
              });
            }
            throw normalizeError(fallbackErr);
          }
        }
      }

      // Non-proof path (trusted off, inspector disabled, or no withProofFn)
      try {
        const result = await fn(sdkRef.current);
        const elapsed = performance.now() - t0;

        if (store.enabled && methodName) {
          store.record(storeKey, {
            queryKey: fullKey,
            methodName: inspectorMethodName,
            methodParams: methodParams ?? {},
            hasProofVariant,
            timestamp: Date.now(),
            durationMs: Math.round(elapsed),
            status: 'success',
            result: safeSerialize(result),
          });
        }

        return (result ?? null) as TData;
      } catch (err) {
        const errMsg = extractErrorMessage(err);
        console.error(`[NPE] ${inspectorMethodName} failed:`, errMsg, err);
        if (store.enabled && methodName) {
          const elapsed = performance.now() - t0;
          store.record(storeKey, {
            queryKey: fullKey,
            methodName: inspectorMethodName,
            methodParams: methodParams ?? {},
            hasProofVariant,
            timestamp: Date.now(),
            durationMs: Math.round(elapsed),
            status: 'error',
            error: errMsg,
          });
        }
        throw normalizeError(err);
      }
    },
    enabled: status === 'ready' && !!sdk && (rest.enabled ?? true),
    ...rest,
  });
  const proofState = classifyProof(q, { trusted, hasProofVariant });
  // RQ's stock `isLoading` is `isPending && isFetching`, so it goes false the
  // moment a query is gated off — including the SDK-boot window when the
  // internal gate above forces `enabled: false`. The common pattern
  // `if (isLoading) <Loading /> else if (data.length === 0) <Empty />` would
  // then flash the empty state before any fetch is attempted. Override to:
  // "loading whenever the caller asked for data but none has arrived". Queries
  // the *caller* explicitly disables stay non-loading so they don't spin
  // forever waiting for a precondition the user hasn't met yet. (Mutating `q`
  // instead of spreading preserves RQ's discriminated-union narrowing.)
  const userEnabled = typeof rest.enabled === 'boolean' ? rest.enabled : true;
  return Object.assign(q, { proofState, isLoading: q.isPending && userEnabled });
}

/**
 * Snapshot a query result for the inspector. WASM class instances expose state
 * via prototype getters (not enumerable own properties), so plain spread/walk
 * yields `{ __wbg_ptr: N }`. `walkInstance` reads getters + `getFoo()` methods
 * recursively, surfacing the real data. Maps/Uint8Arrays/BigInts are then
 * converted to JSON-friendly forms.
 */
function safeSerialize(value: unknown): unknown {
  const walked = walkInstance(value);
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
const IMMUTABLE = Infinity; // document-at-revision, finalized epoch

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

export function useContractHistory(id: string | undefined) {
  return useSdkQuery(
    ['contracts', 'getHistory', id],
    (sdk) => sdk.contracts.getHistory({ dataContractId: id! }) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.contracts.getHistoryWithProof({ dataContractId: id! }), methodName: 'contracts.getHistory', methodParams: { dataContractId: id } },
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
    { enabled: !!contractId && !!type && !!docId, staleTime: IMMUTABLE, withProofFn: (sdk) => sdk.documents.getWithProof(contractId!, type!, docId!), methodName: 'documents.get', methodParams: { contractId, documentType: type, documentId: docId } },
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
export function useStateTransitionResult(hash: string | undefined) {
  return useSdkQuery(
    ['stateTransitions', 'waitForStateTransitionResult', hash],
    (sdk) => sdk.stateTransitions.waitForStateTransitionResult(hash!) as Promise<unknown>,
    { enabled: !!hash, staleTime: LIVE, hasProofVariant: false, methodName: 'stateTransitions.waitForResult', methodParams: { hash } },
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
   *  honored by the new `getDocuments{Count,Sum,Average}` aggregate paths. */
  groupBy?: string[];
}

export function useDocumentsQuery(params: DocumentsQueryParams | undefined) {
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
    ['documents', 'query', ...key],
    (sdk) => sdk.documents.query(params as never) as Promise<unknown>,
    { enabled: !!params, staleTime: LIVE, withProofFn: (sdk) => sdk.documents.queryWithProof(params as never), methodName: 'documents.query', methodParams: params ? { dataContractId: params.dataContractId, documentTypeName: params.documentTypeName, where: params.where, orderBy: params.orderBy, limit: params.limit, startAfter: params.startAfter } : {} },
  );
}

// ----- documents aggregates (count / sum / average) -----
//
// These ride the wasm-sdk's `getDocuments{Count,Sum,Average}` primitives
// directly — there's no `evo-sdk` facade wrapper for them yet (3.1.0-dev.7).
// We unwrap `sdk.getWasmSdkConnected()` once inside each `queryFn`. Skipping
// the proof variant for now (`hasProofVariant: false`) — the inspector will
// show these as "unverified, no proof variant available".

function aggregateKey(prefix: string, params: DocumentsQueryParams | undefined, extra?: string) {
  if (!params) return [prefix];
  return [
    prefix,
    params.dataContractId,
    params.documentTypeName,
    JSON.stringify(params.where ?? []),
    JSON.stringify(params.orderBy ?? []),
    JSON.stringify(params.groupBy ?? []),
    params.limit ?? '',
    params.startAfter ?? '',
    extra ?? '',
  ];
}

export function useDocumentsCount(params: DocumentsQueryParams | undefined) {
  const key = aggregateKey('count', params);
  return useSdkQuery(
    ['documents', 'count', ...key],
    async (sdk) => {
      const w = await sdk.getWasmSdkConnected();
      return (w as unknown as { getDocumentsCount: (q: unknown) => Promise<Map<string, bigint>> })
        .getDocumentsCount(params);
    },
    {
      enabled: !!params,
      staleTime: LIVE,
      hasProofVariant: false,
      methodName: 'documents.getDocumentsCount',
      methodParams: (params ?? {}) as Record<string, unknown>,
    },
  );
}

export function useDocumentsSum(
  params: DocumentsQueryParams | undefined,
  sumProperty: string | undefined,
) {
  const enabled = !!params && !!sumProperty;
  const key = aggregateKey('sum', params, sumProperty);
  return useSdkQuery(
    ['documents', 'sum', ...key],
    async (sdk) => {
      const w = await sdk.getWasmSdkConnected();
      return (w as unknown as { getDocumentsSum: (q: unknown, p: string) => Promise<Map<string, bigint>> })
        .getDocumentsSum(params, sumProperty!);
    },
    {
      enabled,
      staleTime: LIVE,
      hasProofVariant: false,
      methodName: 'documents.getDocumentsSum',
      methodParams: { ...((params ?? {}) as Record<string, unknown>), sumProperty },
    },
  );
}

export interface CountSumPair {
  count: bigint;
  sum: bigint;
}

export function useDocumentsAverage(
  params: DocumentsQueryParams | undefined,
  sumProperty: string | undefined,
) {
  const enabled = !!params && !!sumProperty;
  const key = aggregateKey('avg', params, sumProperty);
  return useSdkQuery(
    ['documents', 'average', ...key],
    async (sdk) => {
      const w = await sdk.getWasmSdkConnected();
      return (w as unknown as { getDocumentsAverage: (q: unknown, p: string) => Promise<Map<string, CountSumPair>> })
        .getDocumentsAverage(params, sumProperty!);
    },
    {
      enabled,
      staleTime: LIVE,
      hasProofVariant: false,
      methodName: 'documents.getDocumentsAverage',
      methodParams: { ...((params ?? {}) as Record<string, unknown>), sumProperty },
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
  return useSdkQuery(
    ['epoch', 'current'],
    (sdk) => sdk.epoch.current() as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.epoch.currentWithProof(), methodName: 'epoch.current', methodParams: {} },
  );
}

export function useEpochInfo(index: number | undefined) {
  const query = { startIndex: index!, endIndex: index! } as never;
  return useSdkQuery(
    ['epoch', 'epochsInfo', index],
    (sdk) => sdk.epoch.epochsInfo(query) as Promise<unknown>,
    { enabled: index !== undefined, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.epoch.epochsInfoWithProof(query), methodName: 'epoch.epochsInfo', methodParams: { startIndex: index, endIndex: index } },
  );
}

export function useEpochRange(from: number | undefined, to: number | undefined) {
  const query = { startIndex: from!, endIndex: to! } as never;
  return useSdkQuery(
    ['epoch', 'epochsInfo', from, to],
    (sdk) => sdk.epoch.epochsInfo(query) as Promise<unknown>,
    { enabled: from !== undefined && to !== undefined && from <= to, staleTime: STRUCTURAL, withProofFn: (sdk) => sdk.epoch.epochsInfoWithProof(query), methodName: 'epoch.epochsInfo', methodParams: { startIndex: from, endIndex: to } },
  );
}

export function useFinalizedEpochInfo(index: number | undefined) {
  const query = { startIndex: index!, endIndex: index! } as never;
  return useSdkQuery(
    ['epoch', 'finalizedInfos', index],
    (sdk) => sdk.epoch.finalizedInfos(query) as Promise<unknown>,
    { enabled: index !== undefined, staleTime: IMMUTABLE, withProofFn: (sdk) => sdk.epoch.finalizedInfosWithProof(query), methodName: 'epoch.finalizedInfos', methodParams: { startIndex: index, endIndex: index } },
  );
}

export function useEvonodesBlocksByRange(epoch: number | undefined, limit = 100) {
  const query = { epoch: epoch!, limit: Math.min(limit, 100) };
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', epoch, limit],
    (sdk) => sdk.epoch.evonodesProposedBlocksByRange(query) as Promise<unknown>,
    { enabled: epoch !== undefined, staleTime: LIVE, withProofFn: (sdk) => sdk.epoch.evonodesProposedBlocksByRangeWithProof(query), methodName: 'epoch.evonodesProposedBlocksByRange', methodParams: { epoch, limit } },
  );
}

export function useAllEvonodeBlocksInEpoch(epoch: number | undefined) {
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', 'all', epoch],
    async (sdk) => {
      const { fetchAllEvonodeBlocks } = await import('@util/epoch');
      return fetchAllEvonodeBlocks(sdk as never, epoch!);
    },
    { enabled: epoch !== undefined, staleTime: LIVE, methodName: 'epoch.evonodesProposedBlocksByRange', methodParams: { epoch, paginated: true } },
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
    { staleTime: LIVE, hasProofVariant: false, methodName: 'system.status', methodParams: {} },
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
) {
  return useSdkQuery(
    ['protocol', 'versionUpgradeVoteStatus', startProTxHash ?? '', count],
    (sdk) => sdk.protocol.versionUpgradeVoteStatus(startProTxHash, count) as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.protocol.versionUpgradeVoteStatusWithProof(startProTxHash, count), methodName: 'protocol.versionUpgradeVoteStatus', methodParams: { startProTxHash, count } },
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
export function useVotePollsByEndDate(startDateMs?: number, endDateMs?: number) {
  const query = { startTimeMs: startDateMs, endTimeMs: endDateMs };
  return useSdkQuery(
    ['voting', 'votePollsByEndDate', startDateMs ?? 0, endDateMs ?? 0],
    (sdk) => sdk.voting.votePollsByEndDate(query) as Promise<unknown>,
    { staleTime: LIVE, withProofFn: (sdk) => sdk.voting.votePollsByEndDateWithProof(query), methodName: 'voting.votePollsByEndDate', methodParams: { startDateMs, endDateMs } },
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
