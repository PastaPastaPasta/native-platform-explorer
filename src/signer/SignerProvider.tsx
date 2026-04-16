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
import type { ExplorerSigner, SignerKind } from './types';

export interface SignerStash {
  kind: SignerKind;
  identityId: string;
}

interface SignerContextValue {
  signer: ExplorerSigner | null;
  /** Previous-session hint for /wallet: "you were connected as X via Y — reconnect?". */
  stash: SignerStash | null;
  connect: (signer: ExplorerSigner) => void;
  disconnect: () => void;
  clearStash: () => void;
}

const SignerContext = createContext<SignerContextValue | null>(null);

// We persist only which adapter the user picked + their identity ID so /wallet
// can say "you were previously connected as …". Private keys are never written
// anywhere — on reload the user must reconnect their signer explicitly.
const STASH_KEY = 'npe:signer-kind';

function readStash(): SignerStash | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STASH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SignerStash>;
    if (
      (parsed.kind === 'extension' || parsed.kind === 'mnemonic' || parsed.kind === 'wif') &&
      typeof parsed.identityId === 'string'
    ) {
      return { kind: parsed.kind, identityId: parsed.identityId };
    }
  } catch {
    /* noop */
  }
  return null;
}

function writeStash(kind: SignerKind, identityId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ kind, identityId }));
}

function removeStash() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STASH_KEY);
}

const IDLE_TIMEOUT_MS = 10 * 60_000;

export function SignerProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<ExplorerSigner | null>(null);
  // Surfaces the previous-session hint once, on mount; disconnect() clears it.
  const [stash, setStash] = useState<SignerStash | null>(() => readStash());
  const idleTimer = useRef<number | null>(null);

  const disconnect = useCallback(() => {
    setSigner((s) => {
      if (s) s.destroy();
      return null;
    });
    removeStash();
    setStash(null);
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const clearStashOnly = useCallback(() => {
    removeStash();
    setStash(null);
  }, []);

  const connect = useCallback((next: ExplorerSigner) => {
    // Replace any prior signer (destroys its secrets).
    setSigner((s) => {
      if (s) s.destroy();
      return next;
    });
    writeStash(next.kind, next.identityId);
    setStash({ kind: next.kind, identityId: next.identityId });
  }, []);

  // Idle-out: if the tab has been hidden for > IDLE_TIMEOUT_MS, disconnect.
  useEffect(() => {
    if (!signer) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(disconnect, IDLE_TIMEOUT_MS);
      } else {
        if (idleTimer.current !== null) {
          window.clearTimeout(idleTimer.current);
          idleTimer.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [signer, disconnect]);

  // Wipe on unload.
  useEffect(() => {
    if (!signer) return;
    const onBeforeUnload = () => disconnect();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [signer, disconnect]);

  const value = useMemo<SignerContextValue>(
    () => ({ signer, stash, connect, disconnect, clearStash: clearStashOnly }),
    [signer, stash, connect, disconnect, clearStashOnly],
  );

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export function useSigner(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error('useSigner must be used within <SignerProvider>.');
  return ctx;
}
