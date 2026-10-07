'use client';

import type { VerificationResult } from '@sdk/proofs';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export interface ProofData {
  grovedbProof: Uint8Array;
  quorumHash: Uint8Array;
  signature: Uint8Array;
  round: number;
  blockIdHash: Uint8Array;
  quorumType: number;
}

export interface ResponseMeta {
  height: number;
  coreChainLockedHeight: number;
  epoch: number;
  timeMs: number;
  protocolVersion: number;
  chainId: string;
}

export interface QueryProofEntry {
  queryKey: readonly unknown[];
  methodName: string;
  methodParams: Record<string, unknown>;
  hasProofVariant: boolean;
  timestamp: number;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
  result?: unknown;
  metadata?: ResponseMeta;
  proof?: ProofData;
  network?: string;
  trusted?: boolean;
  quorumKeySource?: string;
  verification?: VerificationResult;
  proofCaptureError?: string;
  resultCaptureError?: string;
  omitted?: { result: boolean; proof: boolean; reason: 'storage-limit' };
}

export const MAX_PROOF_ENTRIES = 200;
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const STORAGE_KEY = 'npe:queryInspector';

function readEnabled(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Conservative retained-data estimate, including UTF-16 strings and binary buffers.
 * Not an exact JS heap measurement; stops as soon as the configured budget is exceeded. */
export function estimateProofEntryBytes(value: unknown, limit = MAX_PROOF_BYTES): number {
  let bytes = 0;
  const seen = new Set<object>();
  const pending: unknown[] = [value];
  while (pending.length && bytes <= limit) {
    const item = pending.pop();
    if (typeof item === 'string') bytes += item.length * 2;
    else if (item && typeof item === 'object' && !seen.has(item)) {
      seen.add(item);
      bytes += 64;
      if (ArrayBuffer.isView(item)) bytes += item.buffer.byteLength;
      else if (item instanceof ArrayBuffer) bytes += item.byteLength;
      else if (item instanceof Map) {
        bytes += item.size * 32;
        for (const [key, child] of item) pending.push(key, child);
      } else if (item instanceof Set) {
        bytes += item.size * 16;
        for (const child of item) pending.push(child);
      }
      else {
        for (const [key, child] of Object.entries(item)) {
          bytes += key.length * 2 + 16;
          pending.push(child);
        }
      }
    } else bytes += 8;
  }
  return bytes;
}

export interface QueryProofSnapshot {
  entries: QueryProofEntry[];
  version: number;
  retainedBytes: number;
  droppedEntries: number;
  enabled: boolean;
  drawerOpen: boolean;
}

/** Stable recorder API. Reading enabled/generation at invocation time avoids stale closures. */
export interface QueryProofRecorder {
  readonly enabled: boolean;
  readonly generation: number;
  getEntry: (key: string) => QueryProofEntry | undefined;
  record: (key: string, entry: QueryProofEntry, generation?: number) => void;
  clear: () => void;
  setEnabled: (v: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export function createQueryProofStore(limits = { maxEntries: MAX_PROOF_ENTRIES, maxBytes: MAX_PROOF_BYTES }) {
  const entries = new Map<string, { entry: QueryProofEntry; bytes: number }>();
  const listeners = new Set<() => void>();
  const entryListeners = new Map<string, Set<() => void>>();
  let generation = 0;
  let snapshot: QueryProofSnapshot = {
    entries: [], version: 0, retainedBytes: 0, droppedEntries: 0, enabled: true, drawerOpen: false,
  };
  const notify = (changedKeys: Iterable<string> = []) => {
    snapshot = { ...snapshot, entries: Array.from(entries.values(), (v) => v.entry).reverse(), version: snapshot.version + 1 };
    for (const key of changedKeys) entryListeners.get(key)?.forEach((listener) => listener());
    listeners.forEach((listener) => listener());
  };
  const clear = () => {
    const keys = [...entries.keys()];
    entries.clear();
    generation++;
    snapshot = { ...snapshot, retainedBytes: 0, droppedEntries: 0 };
    notify(keys);
  };
  const recorder: QueryProofRecorder = {
    get enabled() { return snapshot.enabled; },
    get generation() { return generation; },
    getEntry: (key) => entries.get(key)?.entry,
    record: (key, original, startedGeneration = generation) => {
      if (!snapshot.enabled || startedGeneration !== generation) return;
      let entry = original;
      let bytes = estimateProofEntryBytes(entry, limits.maxBytes) + key.length * 2;
      if (bytes > limits.maxBytes) {
        const { result, proof, ...summary } = entry;
        entry = {
          ...summary,
          omitted: { result: result !== undefined, proof: proof !== undefined, reason: 'storage-limit' },
        };
        bytes = estimateProofEntryBytes(entry, limits.maxBytes) + key.length * 2;
      }
      if (bytes > limits.maxBytes || limits.maxEntries < 1) {
        const previousBytes = entries.get(key)?.bytes ?? 0;
        entries.delete(key);
        snapshot = { ...snapshot, retainedBytes: snapshot.retainedBytes - previousBytes, droppedEntries: snapshot.droppedEntries + 1 };
        notify([key]);
        return;
      }
      const changed = new Set([key]);
      let retainedBytes = snapshot.retainedBytes - (entries.get(key)?.bytes ?? 0);
      // Updating a query moves it to the newest position rather than evicting it as old.
      entries.delete(key);
      entries.set(key, { entry, bytes });
      retainedBytes += bytes;
      while (entries.size > limits.maxEntries || retainedBytes > limits.maxBytes) {
        const oldestKey = entries.keys().next().value as string;
        retainedBytes -= entries.get(oldestKey)!.bytes;
        entries.delete(oldestKey);
        changed.add(oldestKey);
      }
      snapshot = { ...snapshot, retainedBytes };
      notify(changed);
    },
    clear,
    setEnabled: (enabled) => {
      if (enabled === snapshot.enabled) return;
      try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* storage is optional */ }
      snapshot = { ...snapshot, enabled, drawerOpen: enabled && snapshot.drawerOpen };
      if (!enabled) clear();
      else notify();
    },
    openDrawer: () => { snapshot = { ...snapshot, drawerOpen: true }; notify(); },
    closeDrawer: () => { snapshot = { ...snapshot, drawerOpen: false }; notify(); },
  };
  return {
    recorder,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    subscribeEntry: (key: string, listener: () => void) => {
      let subscribers = entryListeners.get(key);
      if (!subscribers) { subscribers = new Set(); entryListeners.set(key, subscribers); }
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) entryListeners.delete(key);
      };
    },
  };
}

type QueryProofStore = ReturnType<typeof createQueryProofStore>;
const QueryProofStoreContext = createContext<QueryProofStore | null>(null);

export function QueryProofStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createQueryProofStore);
  useEffect(() => { store.recorder.setEnabled(readEnabled()); }, [store]);
  return <QueryProofStoreContext.Provider value={store}>{children}</QueryProofStoreContext.Provider>;
}

function useStore(): QueryProofStore {
  const store = useContext(QueryProofStoreContext);
  if (!store) throw new Error('Proof store hooks must be used within <QueryProofStoreProvider>.');
  return store;
}

export function useQueryProofRecorder(): QueryProofRecorder {
  return useStore().recorder;
}

/** Only the matching query is notified when evidence changes. */
export function useQueryProofEntry(key: string): QueryProofEntry | undefined {
  const store = useStore();
  const subscribe = useCallback((listener: () => void) => store.subscribeEntry(key, listener), [store, key]);
  const getSnapshot = useCallback(() => store.recorder.getEntry(key), [store, key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/** Inspector/footer subscribers opt in to the complete recording list. */
export function useQueryProofStore(): QueryProofSnapshot & QueryProofRecorder {
  const store = useStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Spread getters first so each subscribing render exposes the current snapshot.
  return { ...store.recorder, ...snapshot };
}
