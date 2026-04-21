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

type Awaited<T> = T extends Promise<infer U> ? U : T;

export type SdkQueryResult<TData> = UseQueryResult<TData, Error> & {
  proofState: ProofState;
};

interface SdkQueryOpts<TData>
  extends Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'> {
  /** Does the underlying SDK method expose a `…WithProof` sibling? Defaults to true. */
  hasProofVariant?: boolean;
}

/**
 * Core hook: runs a query against the current SDK only when it is ready,
 * and annotates the return with a `proofState` derived from (a) whether
 * the underlying facade method has a proof variant and (b) the current
 * trusted flag. Every cache key is prefixed with (network, trusted).
 */
function useSdkQuery<TData>(
  key: readonly unknown[],
  fn: (sdk: EvoSDK) => Promise<TData>,
  opts?: SdkQueryOpts<TData>,
): SdkQueryResult<TData> {
  const { sdk, status, network, trusted } = useSdk();
  const { hasProofVariant = true, ...rest } = opts ?? {};

  // Mirror the context's sdk onto a ref so queryFn (which runs async, outside
  // the render cycle) can poll it. This prevents the "SDK not ready" cold-load
  // error: on reload, a query's `enabled` flip and its `queryFn` execution
  // can race, where queryFn closes over a pre-connect `sdk = null` and throws
  // immediately. Polling the ref lets us wait for the SDK instead.
  const sdkRef = useRef<EvoSDK | null>(sdk);
  sdkRef.current = sdk;

  const q = useQuery<TData, Error>({
    queryKey: ['npe', network, trusted, ...key],
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
      // Coerce `undefined` → `null` at the boundary. React Query v5 rejects
      // undefined returns from queryFn; several SDK methods (dpns.resolveName,
      // dpns.getUsernameByName, identities.fetch on a missing ID, etc.)
      // legitimately return undefined for "not found", which we want to
      // surface as `data: null` to the caller, not an error.
      const result = await fn(sdkRef.current);
      return (result ?? null) as TData;
    },
    enabled: status === 'ready' && !!sdk && (rest.enabled ?? true),
    ...rest,
  });
  const proofState = classifyProof(q, { trusted, hasProofVariant });
  return Object.assign(q, { proofState });
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
    { enabled: !!id, staleTime: STRUCTURAL },
  );
}

export function useIdentityBalanceAndRevision(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'balanceAndRevision', id],
    (sdk) => sdk.identities.balanceAndRevision(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE },
  );
}

export function useIdentityKeys(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'getKeys', id],
    (sdk) =>
      sdk.identities.getKeys({
        identityId: id!,
        request: { type: 'all' },
      }) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL },
  );
}

export function useIdentityNonce(id: string | undefined) {
  return useSdkQuery(
    ['identities', 'nonce', id],
    (sdk) => sdk.identities.nonce(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE },
  );
}

export function useIdentityContractNonce(id: string | undefined, contractId: string | undefined) {
  return useSdkQuery(
    ['identities', 'contractNonce', id, contractId],
    (sdk) => sdk.identities.contractNonce(id!, contractId!) as Promise<unknown>,
    { enabled: !!id && !!contractId, staleTime: LIVE },
  );
}

export function useIdentityByPublicKeyHash(pkh: string | undefined) {
  return useSdkQuery(
    ['identities', 'byPublicKeyHash', pkh],
    (sdk) => sdk.identities.byPublicKeyHash(pkh!) as Promise<unknown>,
    { enabled: !!pkh, staleTime: STRUCTURAL },
  );
}

export function useIdentitiesByNonUniquePkh(
  pkh: string | undefined,
  startAfter?: string,
) {
  return useSdkQuery(
    ['identities', 'byNonUniquePublicKeyHash', pkh, startAfter],
    (sdk) =>
      sdk.identities.byNonUniquePublicKeyHash(pkh!, startAfter) as Promise<unknown>,
    { enabled: !!pkh, staleTime: STRUCTURAL },
  );
}

// ----- contracts -----
export function useContract(id: string | undefined) {
  return useSdkQuery(
    ['contracts', 'fetch', id],
    (sdk) => sdk.contracts.fetch(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL },
  );
}

export function useContractHistory(id: string | undefined) {
  return useSdkQuery(
    ['contracts', 'getHistory', id],
    (sdk) => sdk.contracts.getHistory({ dataContractId: id! }) as Promise<unknown>,
    { enabled: !!id, staleTime: STRUCTURAL },
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
    { enabled: !!contractId && !!type && !!docId, staleTime: IMMUTABLE },
  );
}

// ----- tokens -----
export function useTokenTotalSupply(tokenId: string | undefined) {
  return useSdkQuery(
    ['tokens', 'totalSupply', tokenId],
    (sdk) => sdk.tokens.totalSupply(tokenId!) as Promise<unknown>,
    { enabled: !!tokenId, staleTime: LIVE },
  );
}

export function useTokenStatuses(tokenIds: string[] | undefined) {
  return useSdkQuery(
    ['tokens', 'statuses', tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.statuses(tokenIds!) as Promise<unknown>,
    { enabled: !!tokenIds && tokenIds.length > 0, staleTime: LIVE },
  );
}

export function useTokenDirectPurchasePrices(tokenIds: string[] | undefined) {
  return useSdkQuery(
    ['tokens', 'directPurchasePrices', tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.directPurchasePrices(tokenIds!) as Promise<unknown>,
    { enabled: !!tokenIds && tokenIds.length > 0, staleTime: LIVE },
  );
}

export function useTokenContractInfo(contractId: string | undefined) {
  return useSdkQuery(
    ['tokens', 'contractInfo', contractId],
    (sdk) => sdk.tokens.contractInfo(contractId!) as Promise<unknown>,
    { enabled: !!contractId, staleTime: STRUCTURAL },
  );
}

export function useTokenIdentityBalances(
  identityId: string | undefined,
  tokenIds: string[] | undefined,
) {
  return useSdkQuery(
    ['tokens', 'identityBalances', identityId, tokenIds?.join(',') ?? ''],
    (sdk) => sdk.tokens.identityBalances(identityId!, tokenIds!) as Promise<unknown>,
    { enabled: !!identityId && !!tokenIds && tokenIds.length > 0, staleTime: LIVE },
  );
}

// ----- addresses -----
export function useAddressInfo(addr: string | undefined) {
  return useSdkQuery(
    ['addresses', 'get', addr],
    (sdk) => sdk.addresses.get(addr!) as Promise<unknown>,
    { enabled: !!addr, staleTime: LIVE },
  );
}

// ----- dpns -----
export function useDpnsResolve(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'resolveName', name],
    (sdk) => sdk.dpns.resolveName(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL, hasProofVariant: false },
  );
}

export function useDpnsUsername(identityId: string | undefined) {
  return useSdkQuery(
    ['dpns', 'username', identityId],
    (sdk) => sdk.dpns.username(identityId!) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL },
  );
}

export function useDpnsUsernames(identityId: string | undefined) {
  return useSdkQuery(
    ['dpns', 'usernames', 'byIdentity', identityId],
    (sdk) => sdk.dpns.usernames({ identityId: identityId! }) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL },
  );
}

export function useDpnsGetByName(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'getUsernameByName', name],
    (sdk) => sdk.dpns.getUsernameByName(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL },
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
    { enabled: !!name, staleTime: LIVE, hasProofVariant: false },
  );
}

export function useDpnsIsContested(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isContestedUsername', name],
    (sdk) => sdk.dpns.isContestedUsername(toLabel(name!)) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL, hasProofVariant: false },
  );
}

export function useDpnsIsValid(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isValidUsername', name],
    (sdk) => sdk.dpns.isValidUsername(toLabel(name!)) as Promise<unknown>,
    { enabled: !!name, staleTime: IMMUTABLE, hasProofVariant: false },
  );
}

// ----- state transitions -----
// Uses LIVE (30s) staleTime — a "pending" result can flip to final at any
// moment, and we don't want to cache pending for the full structural window.
export function useStateTransitionResult(hash: string | undefined) {
  return useSdkQuery(
    ['stateTransitions', 'waitForStateTransitionResult', hash],
    (sdk) => sdk.stateTransitions.waitForStateTransitionResult(hash!) as Promise<unknown>,
    { enabled: !!hash, staleTime: LIVE, hasProofVariant: false },
  );
}

// ----- voting (for Identity.Votes tab) -----
export function useIdentityVotes(identityId: string | undefined) {
  return useSdkQuery(
    ['voting', 'contestedResourceIdentityVotes', identityId],
    (sdk) =>
      sdk.voting.contestedResourceIdentityVotes({ identityId: identityId! }) as Promise<unknown>,
    { enabled: !!identityId, staleTime: LIVE },
  );
}

// ----- groups (for Identity.Groups + Contract.Groups tabs) -----
export function useIdentityGroups(identityId: string | undefined) {
  return useSdkQuery(
    ['group', 'identityGroups', identityId],
    (sdk) => sdk.group.identityGroups({ identityId: identityId! }) as Promise<unknown>,
    { enabled: !!identityId, staleTime: STRUCTURAL },
  );
}

export function useGroupsDataContracts(contractIds: string[] | undefined) {
  return useSdkQuery(
    ['group', 'groupsDataContracts', contractIds?.join(',') ?? ''],
    (sdk) => sdk.group.groupsDataContracts(contractIds!) as Promise<unknown>,
    { enabled: !!contractIds && contractIds.length > 0, staleTime: STRUCTURAL },
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
    { enabled: !!params, staleTime: LIVE },
  );
}

// ----- token-history direct-purchase (partial enumeration path) -----
// token-history is keyed by (tokenId, …) on every index, so you can't use it
// to enumerate tokens you don't already know about. The one exception is the
// `directPurchase` type, which exposes `byPurchaseCost` — a one-field index
// on purchaseCost alone. Paginating that index gives us every direct-purchase
// event across all tokens; each event carries its tokenId, so we get a real
// (partial) discovery path: "tokens seen in direct-purchase history".
export function useTokenHistoryDirectPurchases(
  tokenHistoryContractId: string | undefined,
  limit = 25,
  startAfter?: string,
) {
  return useSdkQuery(
    ['documents', 'query', 'tokenHistory', 'directPurchase', tokenHistoryContractId, limit, startAfter ?? ''],
    (sdk) =>
      sdk.documents.query({
        dataContractId: tokenHistoryContractId!,
        documentTypeName: 'directPurchase',
        // purchaseCost >= 0 is always true (schema minimum is 0); this lets
        // the query hit the byPurchaseCost index without adding a real filter.
        where: [['purchaseCost', '>=', 0]],
        orderBy: [['purchaseCost', 'asc']],
        limit,
        startAfter,
      } as never) as Promise<unknown>,
    { enabled: !!tokenHistoryContractId, staleTime: LIVE },
  );
}

// ----- dpns prefix search -----
// The SDK's `dpns.usernames` takes { identityId } — it lists the names a given
// identity owns, not a prefix search. Real prefix search runs through
// documents.query on the DPNS domain type, filtering on the
// (normalizedParentDomainName, normalizedLabel) composite index. `prefix`
// is expected already in homograph-safe form (lowercased, o→0, i/l→1) —
// see @util/dpns#convertToHomographSafeChars.
export function useDpnsPrefixSearch(
  prefix: string | undefined,
  dpnsContractId: string | undefined,
  limit = 25,
  startAfter?: string,
) {
  const normalized = prefix?.trim() ?? '';
  const hasContract = !!dpnsContractId;
  const hasPrefix = normalized.length > 0;
  return useSdkQuery(
    ['documents', 'query', 'dpnsPrefix', dpnsContractId, normalized, limit, startAfter ?? ''],
    (sdk) =>
      sdk.documents.query({
        dataContractId: dpnsContractId!,
        documentTypeName: 'domain',
        where: [
          ['normalizedParentDomainName', '==', 'dash'],
          ['normalizedLabel', 'startsWith', normalized],
        ],
        orderBy: [['normalizedLabel', 'asc']],
        limit,
        startAfter,
      } as never) as Promise<unknown>,
    { enabled: hasContract && hasPrefix, staleTime: LIVE },
  );
}

// ----- epoch -----
export function useCurrentEpoch() {
  return useSdkQuery(
    ['epoch', 'current'],
    (sdk) => sdk.epoch.current() as Promise<unknown>,
    { staleTime: LIVE },
  );
}

export function useEpochInfo(index: number | undefined) {
  return useSdkQuery(
    ['epoch', 'epochsInfo', index],
    (sdk) =>
      sdk.epoch.epochsInfo({ startIndex: index!, endIndex: index! } as never) as Promise<unknown>,
    { enabled: index !== undefined, staleTime: STRUCTURAL },
  );
}

export function useEpochRange(from: number | undefined, to: number | undefined) {
  return useSdkQuery(
    ['epoch', 'epochsInfo', from, to],
    (sdk) =>
      sdk.epoch.epochsInfo({ startIndex: from!, endIndex: to! } as never) as Promise<unknown>,
    { enabled: from !== undefined && to !== undefined && from <= to, staleTime: STRUCTURAL },
  );
}

export function useFinalizedEpochInfo(index: number | undefined) {
  return useSdkQuery(
    ['epoch', 'finalizedInfos', index],
    (sdk) =>
      sdk.epoch.finalizedInfos({ startIndex: index!, endIndex: index! } as never) as Promise<unknown>,
    { enabled: index !== undefined, staleTime: IMMUTABLE },
  );
}

export function useEvonodesBlocksByRange(epoch: number | undefined, limit = 100) {
  // EvonodeProposedBlocksRangeQuery accepts { epoch, limit, startAfter } only.
  // Ordering is proTxHash-ascending on the server; we sort by count client-side
  // in evonodesMapToBars. Server caps `limit` at 100 — use
  // `useAllEvonodeBlocksInEpoch` when you need every proposer.
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', epoch, limit],
    (sdk) =>
      sdk.epoch.evonodesProposedBlocksByRange({
        epoch: epoch!,
        limit: Math.min(limit, 100),
      }) as Promise<unknown>,
    { enabled: epoch !== undefined, staleTime: LIVE },
  );
}

/** Paginated: walks `startAfter` across pages of 100 until every proposer in
 *  the epoch is returned. Returns a plain Map<proTxHash, blocks>. */
export function useAllEvonodeBlocksInEpoch(epoch: number | undefined) {
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', 'all', epoch],
    async (sdk) => {
      const { fetchAllEvonodeBlocks } = await import('@util/epoch');
      return fetchAllEvonodeBlocks(sdk as never, epoch!);
    },
    { enabled: epoch !== undefined, staleTime: LIVE },
  );
}

export function useEvonodesBlocksByIds(epoch: number | undefined, ids: string[] | undefined) {
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByIds', epoch, ids?.join(',') ?? ''],
    (sdk) => sdk.epoch.evonodesProposedBlocksByIds(epoch!, ids!) as Promise<unknown>,
    { enabled: epoch !== undefined && !!ids && ids.length > 0, staleTime: LIVE },
  );
}

// ----- system -----
// system.status and currentQuorumsInfo have no WithProof variants per PRD §16.
export function useSystemStatus() {
  return useSdkQuery(
    ['system', 'status'],
    (sdk) => sdk.system.status() as Promise<unknown>,
    { staleTime: LIVE, hasProofVariant: false },
  );
}

export function useCurrentQuorumsInfo() {
  return useSdkQuery(
    ['system', 'currentQuorumsInfo'],
    (sdk) => sdk.system.currentQuorumsInfo() as Promise<unknown>,
    { staleTime: LIVE, hasProofVariant: false },
  );
}

export function useTotalCreditsInPlatform() {
  return useSdkQuery(
    ['system', 'totalCreditsInPlatform'],
    (sdk) => sdk.system.totalCreditsInPlatform() as Promise<unknown>,
    { staleTime: LIVE },
  );
}

export function usePrefundedSpecializedBalance(id: string | undefined) {
  return useSdkQuery(
    ['system', 'prefundedSpecializedBalance', id],
    (sdk) => sdk.system.prefundedSpecializedBalance(id!) as Promise<unknown>,
    { enabled: !!id, staleTime: LIVE },
  );
}

// ----- protocol -----
export function useProtocolVersionUpgradeState() {
  return useSdkQuery(
    ['protocol', 'versionUpgradeState'],
    (sdk) => sdk.protocol.versionUpgradeState() as Promise<unknown>,
    { staleTime: LIVE },
  );
}

export function useProtocolVersionUpgradeVoteStatus(
  startProTxHash: string | undefined,
  count: number,
) {
  return useSdkQuery(
    ['protocol', 'versionUpgradeVoteStatus', startProTxHash ?? '', count],
    (sdk) =>
      sdk.protocol.versionUpgradeVoteStatus(startProTxHash, count) as Promise<unknown>,
    { staleTime: LIVE },
  );
}

// ----- voting polls -----
// VotePollsByEndDateQuery is flat: { startTimeMs?, endTimeMs?, limit?, ... },
// plain numbers (not BigInt). Prior version nested these under startTimeInfo /
// endTimeInfo and wrapped in BigInt, which silently returned empty results.
export function useVotePollsByEndDate(startDateMs?: number, endDateMs?: number) {
  return useSdkQuery(
    ['voting', 'votePollsByEndDate', startDateMs ?? 0, endDateMs ?? 0],
    (sdk) =>
      sdk.voting.votePollsByEndDate({
        startTimeMs: startDateMs,
        endTimeMs: endDateMs,
      }) as Promise<unknown>,
    { staleTime: LIVE },
  );
}

// ----- group contested resources + info -----
export function useContestedResources(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
  startIndexValues?: unknown[],
) {
  return useSdkQuery(
    ['group', 'contestedResources', contractId, documentTypeName, indexName, JSON.stringify(startIndexValues ?? [])],
    (sdk) =>
      sdk.group.contestedResources({
        dataContractId: contractId!,
        documentTypeName: documentTypeName!,
        indexName: indexName!,
        ...(startIndexValues ? { startIndexValues } : {}),
        limit: 100,
      }) as Promise<unknown>,
    {
      enabled: !!contractId && !!documentTypeName && !!indexName,
      staleTime: LIVE,
    },
  );
}

export function useGroupInfos(contractId: string | undefined) {
  return useSdkQuery(
    ['group', 'infos', contractId],
    (sdk) => sdk.group.infos({ dataContractId: contractId! }) as Promise<unknown>,
    { enabled: !!contractId, staleTime: STRUCTURAL },
  );
}

export function useGroupInfo(contractId: string | undefined, position: number | undefined) {
  return useSdkQuery(
    ['group', 'info', contractId, position],
    (sdk) => sdk.group.info(contractId!, position!) as Promise<unknown>,
    {
      enabled: !!contractId && position !== undefined,
      staleTime: STRUCTURAL,
    },
  );
}

export function useGroupMembers(contractId: string | undefined, position: number | undefined) {
  return useSdkQuery(
    ['group', 'members', contractId, position],
    (sdk) =>
      sdk.group.members({
        dataContractId: contractId!,
        groupContractPosition: position!,
      }) as Promise<unknown>,
    {
      enabled: !!contractId && position !== undefined,
      staleTime: LIVE,
    },
  );
}

export function useGroupActions(
  contractId: string | undefined,
  position: number | undefined,
  status: 'ACTIVE' | 'CLOSED' = 'ACTIVE',
) {
  return useSdkQuery(
    ['group', 'actions', contractId, position, status],
    (sdk) =>
      sdk.group.actions({
        dataContractId: contractId!,
        groupContractPosition: position!,
        status,
      }) as Promise<unknown>,
    {
      enabled: !!contractId && position !== undefined,
      staleTime: LIVE,
    },
  );
}

export function useContestedResourceVoteState(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
  indexValues: unknown[] | undefined,
) {
  return useSdkQuery(
    [
      'voting',
      'contestedResourceVoteState',
      contractId,
      documentTypeName,
      indexName,
      JSON.stringify(indexValues ?? []),
    ],
    (sdk) =>
      sdk.voting.contestedResourceVoteState({
        dataContractId: contractId!,
        documentTypeName: documentTypeName!,
        indexName: indexName!,
        indexValues: indexValues!,
      }) as Promise<unknown>,
    {
      enabled: !!contractId && !!documentTypeName && !!indexName && !!indexValues,
      staleTime: LIVE,
    },
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
