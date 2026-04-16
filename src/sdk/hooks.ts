'use client';

import { useContext } from 'react';
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { SdkContext, type SdkContextValue } from './SdkProvider';

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

/** Stage-2-ready wrapper that ties React Query to the current SDK instance.
 *  The query key is prefixed with (network, trusted) so switching either of
 *  those will not surface stale cached responses from the other client. */
export function useSdkQuery<TData>(
  key: QueryKey,
  fn: (sdk: EvoSDK) => Promise<TData>,
  opts?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, Error> {
  const { sdk, status, network, trusted } = useSdk();
  const fullKey = ['npe', network, trusted, ...key] as const;
  return useQuery<TData, Error>({
    queryKey: fullKey,
    queryFn: async () => {
      if (!sdk) throw new Error('SDK is not ready yet.');
      return fn(sdk);
    },
    enabled: status === 'ready' && !!sdk && (opts?.enabled ?? true),
    ...opts,
  });
}
