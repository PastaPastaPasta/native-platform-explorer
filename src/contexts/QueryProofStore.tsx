'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
}

const MAX_ENTRIES = 200;
const STORAGE_KEY = 'npe:queryInspector';

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) !== 'false';
}

interface QueryProofStoreValue {
  entries: QueryProofEntry[];
  version: number;
  /** O(1) lookup of a single entry by its store key (the stringified query
   *  key). Avoids scanning `entries` per consumer on every store update. */
  getEntry: (key: string) => QueryProofEntry | undefined;
  record: (key: string, entry: QueryProofEntry) => void;
  clear: () => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const QueryProofStoreContext = createContext<QueryProofStoreValue | null>(null);

export function QueryProofStoreProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, QueryProofEntry>());
  const [version, setVersion] = useState(0);
  const [enabled, setEnabledState] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setEnabledState(readEnabled());
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(v));
    }
    setEnabledState(v);
    if (!v) {
      mapRef.current.clear();
      setVersion((p) => p + 1);
    }
  }, []);

  const record = useCallback((key: string, entry: QueryProofEntry) => {
    const m = mapRef.current;
    m.set(key, entry);
    if (m.size > MAX_ENTRIES) {
      const first = m.keys().next().value;
      if (first !== undefined) m.delete(first);
    }
    setVersion((p) => p + 1);
  }, []);

  const clear = useCallback(() => {
    mapRef.current.clear();
    setVersion((p) => p + 1);
  }, []);

  const getEntry = useCallback((key: string) => mapRef.current.get(key), []);

  const entries = useMemo(
    () => Array.from(mapRef.current.values()).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo<QueryProofStoreValue>(
    () => ({ entries, version, getEntry, record, clear, enabled, setEnabled, drawerOpen, openDrawer, closeDrawer }),
    [entries, getEntry, record, clear, enabled, setEnabled, drawerOpen, openDrawer, closeDrawer, version],
  );

  return (
    <QueryProofStoreContext.Provider value={value}>
      {children}
    </QueryProofStoreContext.Provider>
  );
}

export function useQueryProofStore(): QueryProofStoreValue {
  const ctx = useContext(QueryProofStoreContext);
  if (!ctx) {
    throw new Error('useQueryProofStore must be used within <QueryProofStoreProvider>.');
  }
  return ctx;
}
