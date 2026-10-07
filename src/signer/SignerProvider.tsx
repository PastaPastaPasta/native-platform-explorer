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
import { useSdk } from '@sdk/hooks';

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
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SignerStash>;
    if (
      (parsed.kind === 'extension' ||
        parsed.kind === 'mnemonic' ||
        parsed.kind === 'wif' ||
        parsed.kind === 'backup') &&
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
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ kind, identityId }));
  } catch {
    /* Storage may be blocked; the live signer still works. */
  }
}

function removeStash() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    /* Storage may be blocked. */
  }
}

const IDLE_TIMEOUT_MS = 10 * 60_000;

export function SignerProvider({ children }: { children: ReactNode }) {
  const { sdk, network, trusted, status, sessionId, sessionSignal } = useSdk();
  const [signer, setSigner] = useState<ExplorerSigner | null>(null);
  const signerRef = useRef<ExplorerSigner | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const [connectionGeneration, setConnectionGeneration] = useState(0);
  const contextRef = useRef({ sdk, network, trusted, sessionId, sessionSignal });
  contextRef.current = { sdk, network, trusted, sessionId, sessionSignal };
  // Surfaces the previous-session hint. Initial value must be null on both
  // server and client to avoid a hydration mismatch; the useEffect below pulls
  // the real stash from sessionStorage after mount.
  const [stash, setStash] = useState<SignerStash | null>(null);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const s = readStash();
    if (s) setStash(s);
  }, []);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    setConnectionGeneration(generationRef.current);
    signerRef.current?.destroy();
    signerRef.current = null;
    setSigner(null);
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

  const connect = useCallback(
    (next: ExplorerSigner) => {
      const current = contextRef.current;
      if (
        !mountedRef.current ||
        generationRef.current !== connectionGeneration ||
        current.sdk !== sdk ||
        current.network !== network ||
        current.trusted !== trusted ||
        current.sessionId !== sessionId ||
        current.sessionSignal !== sessionSignal ||
        sessionSignal?.aborted ||
        (next.sdk && next.sdk !== sdk)
      ) {
        next.destroy();
        throw new Error(
          'The SDK session changed while connecting. Reconnect on the current network.',
        );
      }
      // Replace any prior signer (destroys its secrets).
      if (signerRef.current !== next) signerRef.current?.destroy();
      signerRef.current = next;
      generationRef.current += 1;
      setConnectionGeneration(generationRef.current);
      setSigner(next);
      writeStash(next.kind, next.identityId);
      setStash({ kind: next.kind, identityId: next.identityId });
    },
    [sdk, network, trusted, sessionId, sessionSignal, connectionGeneration],
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
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    };
  }, [signer, disconnect]);

  // Wipe on unload.
  useEffect(() => {
    if (!signer) return;
    const onBeforeUnload = () => disconnect();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [signer, disconnect]);

  // Keys are bound to the exact SDK instance, including reconnects to the same network.
  const sessionRef = useRef({ sdk, network, trusted });
  const hasReadySessionRef = useRef(false);
  useEffect(() => {
    const previous = sessionRef.current;
    sessionRef.current = { sdk, network, trusted };
    if (
      (signerRef.current || hasReadySessionRef.current) &&
      (previous.sdk !== sdk || previous.network !== network || previous.trusted !== trusted)
    )
      disconnect();
    if (status === 'ready') hasReadySessionRef.current = true;
  }, [sdk, network, trusted, status, disconnect]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      signerRef.current?.destroy();
      signerRef.current = null;
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

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
