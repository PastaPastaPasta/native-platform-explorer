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

interface SignerContextValue {
  signer: ExplorerSigner | null;
  connect: (signer: ExplorerSigner) => void;
  disconnect: () => void;
}

const SignerContext = createContext<SignerContextValue | null>(null);

// We persist only which adapter the user picked + their identity ID (for
// rehydrating the signer-status card on reload). The prompt to re-authenticate
// is handled by /wallet based on the absence of the in-memory `signer`.
const STASH_KEY = 'npe:signer-kind';

function writeStash(kind: SignerKind, identityId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ kind, identityId }));
}

function clearStash() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STASH_KEY);
}

const IDLE_TIMEOUT_MS = 10 * 60_000;

export function SignerProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<ExplorerSigner | null>(null);
  const idleTimer = useRef<number | null>(null);

  const disconnect = useCallback(() => {
    setSigner((s) => {
      if (s) s.destroy();
      return null;
    });
    clearStash();
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const connect = useCallback(
    (next: ExplorerSigner) => {
      // Replace any prior signer (destroys its secrets).
      setSigner((s) => {
        if (s) s.destroy();
        return next;
      });
      writeStash(next.kind, next.identityId);
    },
    [],
  );

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
    () => ({ signer, connect, disconnect }),
    [signer, connect, disconnect],
  );

  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>;
}

export function useSigner(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error('useSigner must be used within <SignerProvider>.');
  return ctx;
}
