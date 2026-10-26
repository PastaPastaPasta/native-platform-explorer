'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { BUNDLED_WELL_KNOWN, type WellKnown, type WellKnownKind } from '@constants/well-known';
import { getConfig } from '@/config';
import { useSdk } from '@sdk/hooks';
import {
  addLocalEntry,
  fetchRemoteRegistry,
  LOCAL_REGISTRY_KEY,
  mergeRegistry,
  readLocalRegistry,
  RegistryError,
  writeLocalRegistry,
  type RegistryEntry,
} from '@util/well-known-registry';

export type RemoteRegistryState =
  | { status: 'disabled' }
  | { status: 'loading'; url: string }
  | { status: 'ready'; url: string; count: number }
  | { status: 'error'; url: string; message: string };

interface RegistrySnapshot {
  remote: RemoteRegistryState;
  remoteEntries: WellKnown[];
  local: WellKnown[];
}

const SERVER_SNAPSHOT: RegistrySnapshot = { remote: { status: 'disabled' }, remoteEntries: [], local: [] };
let snapshot: RegistrySnapshot = SERVER_SNAPSHOT;
let started = false;
const listeners = new Set<() => void>();

function update(next: Partial<RegistrySnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const url = getConfig().wellKnownUrl;
  update({ local: readLocalRegistry(), remote: url ? { status: 'loading', url } : { status: 'disabled' } });
  window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_REGISTRY_KEY || event.key === null) update({ local: readLocalRegistry() });
  });
  if (url) {
    fetchRemoteRegistry(url).then(
      (entries) => update({ remoteEntries: entries, remote: { status: 'ready', url, count: entries.length } }),
      (error: unknown) => update({
        remote: { status: 'error', url, message: error instanceof Error ? error.message : String(error) },
      }),
    );
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}

/** Test hook: forget loaded state so the next subscriber starts again. */
export function resetWellKnownRegistryForTests() {
  started = false;
  snapshot = SERVER_SNAPSHOT;
}

/** The merged well-known registry for the active network: bundled entries,
 *  the optional remote registry, and the user's local entries. */
export function useWellKnownRegistry() {
  const { network } = useSdk();
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  return useMemo(() => {
    const sources = { bundled: BUNDLED_WELL_KNOWN, remote: state.remoteEntries, local: state.local };
    const entries = mergeRegistry(sources, network);
    return {
      network,
      entries,
      /** Every network's entries, for management in Settings. */
      allEntries: mergeRegistry(sources),
      remote: state.remote,
      local: state.local,
      /** Throws a RegistryError when the entry is invalid or already listed. */
      addLocal(raw: unknown) {
        const next = addLocalEntry(state.local, raw, mergeRegistry(sources));
        try { writeLocalRegistry(next); } catch {
          throw new RegistryError('Browser storage is unavailable; the entry was not saved.');
        }
        update({ local: next });
      },
      removeLocal(entry: Pick<WellKnown, 'id' | 'network'>) {
        const next = state.local.filter((item) => !(item.id === entry.id && item.network === entry.network));
        try { writeLocalRegistry(next); } catch { /* keep the in-memory removal */ }
        update({ local: next });
      },
    };
  }, [network, state]);
}

export function useWellKnownEntries(kind: WellKnownKind): RegistryEntry[] {
  const { entries } = useWellKnownRegistry();
  return useMemo(() => entries.filter((entry) => entry.kind === kind), [entries, kind]);
}
