'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';

export type ProofStatus = 'verified' | 'trusted' | 'failed';

export interface ProofPayload {
  title: string;
  status: ProofStatus;
  entry?: QueryProofEntry;
  /** Optional inline details when no full entry is available. */
  notes?: string;
}

interface ProofInspectorValue {
  payload: ProofPayload | null;
  isOpen: boolean;
  open: (payload: ProofPayload) => void;
  close: () => void;
}

const ProofInspectorContext = createContext<ProofInspectorValue | null>(null);

export function ProofInspectorProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ProofPayload | null>(null);
  const open = useCallback((p: ProofPayload) => setPayload(p), []);
  const close = useCallback(() => setPayload(null), []);
  const value = useMemo<ProofInspectorValue>(
    () => ({ payload, isOpen: payload !== null, open, close }),
    [payload, open, close],
  );
  return <ProofInspectorContext.Provider value={value}>{children}</ProofInspectorContext.Provider>;
}

export function useProofInspector(): ProofInspectorValue {
  const ctx = useContext(ProofInspectorContext);
  if (!ctx) throw new Error('useProofInspector must be used within <ProofInspectorProvider>.');
  return ctx;
}
