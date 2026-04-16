'use client';

import { useQuery, useQueries, type UseQueryOptions } from '@tanstack/react-query';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { useSdk } from './hooks';
import { getConfig } from '@/config';

type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Core hook: runs a query against the current SDK only when it is ready.
 * Every cache key is prefixed with (network, trusted) so clients do not see
 * stale responses across network switches.
 *
 * The queryKey is constructed inline on every render — React Query uses
 * structural equality on keys, so an identical-by-value fresh array does
 * not trigger a refetch. We intentionally do not `useMemo` the key: a
 * memo keyed on `key` itself is a no-op because callers pass a new inline
 * array each render.
 */
function useSdkQuery<TData>(
  key: readonly unknown[],
  fn: (sdk: EvoSDK) => Promise<TData>,
  opts?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>,
) {
  const { sdk, status, network, trusted } = useSdk();
  return useQuery<TData, Error>({
    queryKey: ['npe', network, trusted, ...key],
    queryFn: async () => {
      if (!sdk) throw new Error('SDK not ready');
      return fn(sdk);
    },
    enabled: status === 'ready' && !!sdk && (opts?.enabled ?? true),
    ...opts,
  });
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
    { enabled: !!name, staleTime: STRUCTURAL },
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

export function useDpnsIsAvailable(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isNameAvailable', name],
    (sdk) => sdk.dpns.isNameAvailable(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: LIVE },
  );
}

export function useDpnsIsContested(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isContestedUsername', name],
    (sdk) => sdk.dpns.isContestedUsername(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: STRUCTURAL },
  );
}

export function useDpnsIsValid(name: string | undefined) {
  return useSdkQuery(
    ['dpns', 'isValidUsername', name],
    (sdk) => sdk.dpns.isValidUsername(name!) as Promise<unknown>,
    { enabled: !!name, staleTime: IMMUTABLE },
  );
}

// ----- state transitions -----
// Uses LIVE (30s) staleTime — a "pending" result can flip to final at any
// moment, and we don't want to cache pending for the full structural window.
export function useStateTransitionResult(hash: string | undefined) {
  return useSdkQuery(
    ['stateTransitions', 'waitForStateTransitionResult', hash],
    (sdk) => sdk.stateTransitions.waitForStateTransitionResult(hash!) as Promise<unknown>,
    { enabled: !!hash, staleTime: LIVE },
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

// ----- dpns prefix search -----
export function useDpnsUsernamesByPrefix(prefix: string | undefined, limit = 20, startAfter?: string) {
  return useSdkQuery(
    ['dpns', 'usernames', 'prefix', prefix, limit, startAfter ?? ''],
    (sdk) =>
      sdk.dpns.usernames({
        labelPrefix: prefix!,
        limit,
        startAfter,
      } as never) as Promise<unknown>,
    { enabled: !!prefix, staleTime: LIVE },
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
  return useSdkQuery(
    ['epoch', 'evonodesProposedBlocksByRange', epoch, limit],
    (sdk) =>
      sdk.epoch.evonodesProposedBlocksByRange({
        epoch: epoch!,
        limit,
        orderAscending: false,
      } as never) as Promise<unknown>,
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
export function useSystemStatus() {
  return useSdkQuery(
    ['system', 'status'],
    (sdk) => sdk.system.status() as Promise<unknown>,
    { staleTime: LIVE },
  );
}

export function useCurrentQuorumsInfo() {
  return useSdkQuery(
    ['system', 'currentQuorumsInfo'],
    (sdk) => sdk.system.currentQuorumsInfo() as Promise<unknown>,
    { staleTime: LIVE },
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
export function useVotePollsByEndDate(startDateMs?: number, endDateMs?: number) {
  return useSdkQuery(
    ['voting', 'votePollsByEndDate', startDateMs ?? 0, endDateMs ?? 0],
    (sdk) =>
      sdk.voting.votePollsByEndDate({
        startTimeInfo: startDateMs !== undefined ? { startTimeMs: BigInt(startDateMs) } : undefined,
        endTimeInfo: endDateMs !== undefined ? { endTimeMs: BigInt(endDateMs) } : undefined,
      } as never) as Promise<unknown>,
    { staleTime: LIVE },
  );
}

// ----- group contested resources + info -----
export function useContestedResources(
  contractId: string | undefined,
  documentTypeName: string | undefined,
  indexName: string | undefined,
) {
  return useSdkQuery(
    ['group', 'contestedResources', contractId, documentTypeName, indexName],
    (sdk) =>
      sdk.group.contestedResources({
        contractId: contractId!,
        documentTypeName: documentTypeName!,
        indexName: indexName!,
      } as never) as Promise<unknown>,
    {
      enabled: !!contractId && !!documentTypeName && !!indexName,
      staleTime: LIVE,
    },
  );
}

export function useGroupInfos(contractId: string | undefined) {
  return useSdkQuery(
    ['group', 'infos', contractId],
    (sdk) => sdk.group.infos({ dataContractId: contractId! } as never) as Promise<unknown>,
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
      sdk.group.members({ contractId: contractId!, position: position! } as never) as Promise<unknown>,
    {
      enabled: !!contractId && position !== undefined,
      staleTime: LIVE,
    },
  );
}

export function useGroupActions(contractId: string | undefined, position: number | undefined) {
  return useSdkQuery(
    ['group', 'actions', contractId, position],
    (sdk) =>
      sdk.group.actions({ contractId: contractId!, position: position! } as never) as Promise<unknown>,
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
        contractId: contractId!,
        documentTypeName: documentTypeName!,
        indexName: indexName!,
        indexValues: indexValues!,
      } as never) as Promise<unknown>,
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
