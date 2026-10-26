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
import { isAllEndpointsFailure } from './errors';
import { getSdkQueryKey } from './session-keys';

export { getSdkQueryKey, isRetiredSessionKey } from './session-keys';

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

/**
 * Return `result` with some fields replaced, without copying it. React Query
 * returns a tracking proxy that records which fields a render reads, so a
 * component only re-renders when those change; spreading or mutating it would
 * read (and track) every field.
 */
export function overlayQueryResult<T extends object, O extends object>(result: T, overrides: O): T & O {
  const own = (key: string | symbol) => Object.prototype.hasOwnProperty.call(overrides, key);
  return new Proxy(result, {
    get: (target, key) => (own(key) ? (overrides as Record<string | symbol, unknown>)[key] : Reflect.get(target, key)),
    has: (target, key) => own(key) || Reflect.has(target, key),
    ownKeys: (target) => [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(overrides)])],
    getOwnPropertyDescriptor: (target, key) => (own(key)
      ? { configurable: true, enumerable: true, writable: false, value: (overrides as Record<string | symbol, unknown>)[key] }
      : Reflect.getOwnPropertyDescriptor(target, key)),
  }) as T & O;
}

/** One readiness/session boundary shared by ordinary and proof-aware queries.
 * Caller options may restrict execution but cannot override SDK readiness.
 *
 * While the session is not ready, `refetch()` is a no-op (React Query v5's
 * refetch ignores `enabled`, and running the query would cache a bogus "not
 * ready" error under this session's key). When the session itself has failed,
 * caller-enabled queries without data report that failure as their error, and
 * `refetch()` reconnects, so cards show an error instead of spinning. */
export function useSdkQuery<TData>(
  key: QueryKey,
  fn: (sdk: EvoSDK, execution: SdkQueryExecution) => Promise<TData>,
  opts?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, Error> {
  const context = useSdk();
  const { sdk, status, sessionSignal, sessionId, reportUnreachable, reconnect } = context;
  const client = useQueryClient();
  const fullKey = getSdkQueryKey(context, key);
  const ready = status === 'ready' && !!sdk && !sessionSignal?.aborted;
  const q = useQuery<TData, Error>({
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
        // Cheap when already clear: the provider keeps the same state.
        reportUnreachable(sessionId, null);
        return result;
      } catch (error) {
        if (isAllEndpointsFailure(error)) reportUnreachable(sessionId, error);
        throw error;
      } finally {
        sessionSignal?.removeEventListener('abort', cancel);
      }
    },
    enabled: (query) => ready && (
      typeof opts?.enabled === 'function' ? opts.enabled(query) : (opts?.enabled ?? true)
    ),
  });
  if (ready) return q;
  const idle = () => Promise.resolve(q);
  const refetch = status === 'error' ? () => { reconnect(); return idle(); } : idle;
  const userEnabled = typeof opts?.enabled === 'boolean' ? opts.enabled : true;
  const reportsSessionFailure = status === 'error' && context.error && userEnabled && q.data === undefined;
  const overrides = reportsSessionFailure
    ? {
      status: 'error',
      error: context.error,
      isError: true,
      isPending: false,
      isLoading: false,
      isLoadingError: true,
      isSuccess: false,
      refetch,
    }
    : { refetch };
  return overlayQueryResult(q, overrides) as unknown as UseQueryResult<TData, Error>;
}
