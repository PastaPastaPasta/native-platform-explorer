'use client';

import { useContext } from 'react';
import {
  useQuery,
  useQueryClient,
  CancelledError,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { SdkContext, type SdkContextValue } from './SdkProvider';
import type { Network } from './networks';

export function useSdk(): SdkContextValue {
  const ctx = useContext(SdkContext);
  if (!ctx) {
    throw new Error('useSdk must be used within <SdkProvider>.');
  }
  return ctx;
}

/** Returns the SDK if ready; throws a sentinel "not-ready" error otherwise
 * so an ErrorBoundary / Suspense boundary higher up can handle it. */
export function useReadyEvoSdk(): EvoSDK {
  const { sdk, status, error } = useSdk();
  if (status === 'error' && error) throw error;
  if (status !== 'ready' || !sdk) {
    throw new Promise<void>(() => {
      /* keep suspended; SdkProvider re-renders when ready */
    });
  }
  return sdk;
}

export function getSdkQueryKey(
  { network, trusted, sessionId }: Pick<SdkContextValue, 'network' | 'trusted' | 'sessionId'>,
  key: QueryKey,
): QueryKey {
  return ['npe', network, trusted, sessionId, ...key];
}

/** Confirmed writes can affect balances, nonces, schemas, and list queries.
 * Invalidate every SDK session/trust variant on the submitted network. */
export function invalidateNetworkQueries(client: QueryClient, network: Network) {
  return client.invalidateQueries({ queryKey: ['npe', network] });
}

export interface SdkQueryExecution {
  signal: AbortSignal;
  queryKey: QueryKey;
  /** Guard side effects after an SDK await; the SDK does not accept a signal. */
  assertActive: () => void;
}

/** One readiness/session boundary shared by ordinary and proof-aware queries.
 * Caller options may restrict execution but cannot override SDK readiness. */
export function useSdkQuery<TData>(
  key: QueryKey,
  fn: (sdk: EvoSDK, execution: SdkQueryExecution) => Promise<TData>,
  opts?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, Error> {
  const context = useSdk();
  const { sdk, status, sessionSignal } = context;
  const client = useQueryClient();
  const fullKey = getSdkQueryKey(context, key);
  const ready = status === 'ready' && !!sdk && !sessionSignal?.aborted;
  return useQuery<TData, Error>({
    ...opts,
    queryKey: fullKey,
    queryFn: async ({ signal }) => {
      const assertActive = () => {
        if (!ready || !sdk) throw new Error('SDK is not ready yet.');
        if (signal.aborted || sessionSignal?.aborted) {
          throw new CancelledError({ revert: true });
        }
      };
      assertActive();
      // Reading React Query's signal also makes unobserved requests cancellable.
      // Session cancellation stops React Query immediately; checks after await
      // prevent SDK requests that cannot be aborted from publishing side effects.
      const cancel = () => { void client.cancelQueries({ queryKey: fullKey, exact: true }); };
      sessionSignal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await fn(sdk!, { signal, queryKey: fullKey, assertActive });
        assertActive();
        return result;
      } finally {
        sessionSignal?.removeEventListener('abort', cancel);
      }
    },
    enabled: (query) => ready && (
      typeof opts?.enabled === 'function' ? opts.enabled(query) : (opts?.enabled ?? true)
    ),
  });
}
