'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  finishPrefetch,
  getActivePrefetches,
  prefetchKey,
  subscribePrefetches,
  type PrefetchTarget,
} from '@hooks/usePrefetch';
import {
  useContract,
  useDpnsResolve,
  useEpochInfo,
  useIdentity,
  useTokenContractInfo,
} from '@sdk/queries';

/** A prefetch whose query never settles is released after this long. */
const MAX_PREFETCH_MS = 30_000;

// React Query reports `fetching` from the first render when a mount will fetch,
// so `idle` means the result is cached, settled, or the query is disabled.
function useSettle(name: string, q: Pick<UseQueryResult<unknown, Error>, 'fetchStatus'>) {
  const settled = q.fetchStatus === 'idle';
  useEffect(() => {
    if (settled) finishPrefetch(name);
  }, [name, settled]);
  useEffect(() => {
    const timer = window.setTimeout(() => finishPrefetch(name), MAX_PREFETCH_MS);
    return () => window.clearTimeout(timer);
  }, [name]);
}

// One component per kind: each mounts exactly the hook its page uses first.
function Identity({ name, id }: { name: string; id: string }) { useSettle(name, useIdentity(id)); return null; }
function Contract({ name, id }: { name: string; id: string }) { useSettle(name, useContract(id)); return null; }
function Token({ name, id }: { name: string; id: string }) { useSettle(name, useTokenContractInfo(id)); return null; }
function Dpns({ name, value }: { name: string; value: string }) { useSettle(name, useDpnsResolve(value)); return null; }
function Epoch({ name, index }: { name: string; index: number }) { useSettle(name, useEpochInfo(index)); return null; }

function Prefetcher({ target }: { target: PrefetchTarget }) {
  const name = prefetchKey(target);
  switch (target.kind) {
    case 'identity': return <Identity name={name} id={target.id} />;
    case 'contract': return <Contract name={name} id={target.id} />;
    case 'token': return <Token name={name} id={target.id} />;
    case 'dpns': return <Dpns name={name} value={target.name} />;
    case 'epoch': return <Epoch name={name} index={target.index} />;
  }
}

/** Renders nothing visible: keeps each requested prefetch's query observed
 *  until it settles, so leaving the link does not cancel the request. */
export function PrefetchHost() {
  const active = useSyncExternalStore(subscribePrefetches, getActivePrefetches, getActivePrefetches);
  return (
    <>
      {[...active].map(([key, target]) => <Prefetcher key={key} target={target} />)}
    </>
  );
}
