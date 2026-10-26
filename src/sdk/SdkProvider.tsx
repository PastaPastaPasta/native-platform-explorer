'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClientContext } from '@tanstack/react-query';
import type { EvoSDK as EvoSDKType } from '@dashevo/evo-sdk';
import {
  DEFAULT_NETWORK,
  hasNetwork,
  initNetworkRegistry,
  type Network,
} from './networks';
import { getConfig } from '@/config';
import { normalizeError, SdkSessionError } from './errors';
import { measureSdkPhase } from './timing';
import {
  buildSdkOptions,
  CONNECTION_SETTINGS_KEY,
  defaultConnectionSettings,
  parseConnectionSettings,
  resolveQuorumUrl,
  sameConnectionSettings,
  type ConnectionSettings,
} from './connection-settings';
import { getQuorumKeySource } from './proofs';
import { isRetiredSessionKey } from './session-keys';

export { getDevnetSdkArgs, type DevnetSdkArgs } from './connection-settings';

export type SdkStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface SdkContextValue {
  sdk: EvoSDKType | null;
  status: SdkStatus;
  network: Network;
  /** Always true in the app: the pinned WASM SDK cannot query without a
   *  trusted context. Kept in cache keys and evidence for compatibility. */
  trusted: boolean;
  /** Effective trusted quorum service override for this session, if any. */
  quorumUrl: string | null;
  connectionSettings: ConnectionSettings;
  /** Changes for every connection attempt, including same-network reconnects. */
  sessionId: number;
  /** Aborted synchronously when this connection is superseded or unmounted. */
  sessionSignal: AbortSignal | null;
  error: Error | null;
  /** Set while the current (ready) session has seen every DAPI endpoint fail.
   *  The session stays usable: the SDK un-bans nodes over time, and the next
   *  successful query clears this. */
  unreachable: Error | null;
  setNetwork: (n: Network) => void;
  setConnectionSettings: (next: ConnectionSettings) => void;
  reconnect: () => void;
  /** Record (error) or clear (null) that no DAPI endpoint answered a query of
   *  the given session. Reports for retired sessions are ignored. */
  reportUnreachable: (sessionId: number, error: unknown | null) => void;
}

export const SdkContext = createContext<SdkContextValue | null>(null);

const NETWORK_KEY = 'npe:network';
// Removed preference: untrusted sessions cannot query with the pinned SDK.
const LEGACY_TRUSTED_KEY = 'npe:trusted';
// Unique across provider remounts sharing the same React Query client too.
let nextSessionId = 0;

function readStoredNetwork(fallback: Network): Network {
  const raw = readPreference(NETWORK_KEY);
  return raw && hasNetwork(raw) ? raw : fallback;
}

function readPreference(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Browsers may block the Storage getter itself or individual operations.
    // Continue with configured defaults and keep choices in memory.
    return null;
  }
}

function storePreference(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is optional; a quota/security error must not prevent a switch.
  }
}

function removePreference(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best effort; a stale key is ignored on read.
  }
}

function readStoredConnectionSettings(): ConnectionSettings {
  const raw = readPreference(CONNECTION_SETTINGS_KEY);
  if (!raw) return defaultConnectionSettings();
  try {
    return parseConnectionSettings(JSON.parse(raw));
  } catch {
    return defaultConnectionSettings();
  }
}

function readUrlNetwork(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URL(window.location.href).searchParams.get('network');
    return param || null;
  } catch {
    return null;
  }
}

/** Isolate useSearchParams' static-export Suspense boundary from app content. */
function UrlNetworkSync({ onChange }: { onChange: (network: string | null) => void }) {
  const params = useSearchParams();
  const requested = params.get('network');
  useEffect(() => { onChange(requested); }, [onChange, requested]);
  return null;
}

async function constructSdk(
  network: Network,
  settings: ConnectionSettings,
  sessionId: number,
  signal: AbortSignal,
): Promise<EvoSDKType> {
  // getNetwork tolerates unknown names for display, so never use its fallback
  // when choosing the actual network transport.
  if (!hasNetwork(network)) throw new Error(`Unknown network "${network}". Choose a configured network.`);
  // Dynamically import so the heavy WASM module does not block the initial app paint.
  const mod = await measureSdkPhase('module-load', sessionId, signal, () => import('@dashevo/evo-sdk'));
  return measureSdkPhase('construct', sessionId, signal, () => new mod.EvoSDK(buildSdkOptions(network, settings)));
}

/** Reject after `ms`; the SDK's quorum prefetch has no timeout of its own. */
function withDeadline<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(onTimeout()), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Free the WASM state of an instance no consumer ever received (superseded or
 * timed out), once its `connect()` settles. Published instances are left to
 * wasm-bindgen's FinalizationRegistry: freeing one while a request is in flight
 * makes that request fail with "null pointer passed to rust". */
function releaseUnpublished(instance: EvoSDKType, connecting: Promise<void>, logLevel: () => string): void {
  void connecting.then(() => {
    try {
      if (instance.isConnected) instance.wasm.free();
    } catch {
      // Already freed or not owned; nothing else holds this instance.
    }
    // Its late build applied its own (process-global) log filter; restore the
    // current session's level.
    void import('@dashevo/evo-sdk')
      .then(({ EvoSDK }) => (typeof EvoSDK.setLogLevel === 'function' ? EvoSDK.setLogLevel(logLevel()) : undefined))
      .catch(() => {});
  }, () => {});
}

/** Identity of the SDK a selection would build; settings that do not change
 *  it (another network's quorum URL, the startup deadline) keep the session. */
function sessionOptionsKey(network: Network, settings: ConnectionSettings): string {
  return hasNetwork(network) ? JSON.stringify(buildSdkOptions(network, settings)) : '';
}

export function SdkProvider({ children }: { children: ReactNode }) {
  const config = getConfig();
  // Initial state is the build-time / env fallback so SSR + first client render
  // agree (otherwise hydration mismatches: server sees window=undefined and
  // returns the fallback, client reads localStorage and may return the other
  // choice). After hydration the useEffect below pulls the stored values in.
  const defaultNetwork: Network = config?.defaultNetwork ?? DEFAULT_NETWORK;
  const queryClient = useContext(QueryClientContext);
  const [network, setNetworkState] = useState<Network>(defaultNetwork);
  const [connectionSettings, setConnectionSettingsState] = useState<ConnectionSettings>(defaultConnectionSettings);
  const [sdk, setSdk] = useState<EvoSDKType | null>(null);
  const [status, setStatus] = useState<SdkStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [unreachable, setUnreachable] = useState<{ sessionId: number; error: Error } | null>(null);
  const [sessionId, setSessionId] = useState(0);
  const [sessionSignal, setSessionSignal] = useState<AbortSignal | null>(null);
  const sessionController = useRef<AbortController | null>(null);
  const activeSessionId = useRef(0);
  const connecting = useRef(false);
  // Mirror the selection so `setNetwork` / `setConnectionSettings` can detect
  // no-op calls without re-creating the callback every render.
  const networkRef = useRef(network);
  networkRef.current = network;
  const settingsRef = useRef(connectionSettings);
  settingsRef.current = connectionSettings;
  // Gate the first connect on the URL/localStorage hydration below. Without
  // this, every mount starts a connect against the SSR-fallback network
  // (testnet) before the effect can swap it to a devnet, which not only
  // wastes a build but kicks off the testnet trusted-context prefetch
  // (`quorums.testnet.networks.dash.org/*`) — making it look like devnet
  // pages are still talking to testnet.
  const [hydrated, setHydrated] = useState(false);
  const optionsKey = sessionOptionsKey(network, connectionSettings);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const networkErrorRef = useRef<{ name: string; source: 'url' | 'default' | 'selection' } | null>(null);

  const blockUnknownNetwork = useCallback((requested: string, source: 'url' | 'default' | 'selection') => {
    if (networkErrorRef.current?.name === requested && networkErrorRef.current.source === source) return;
    networkErrorRef.current = { name: requested, source };
    sessionController.current?.abort();
    connecting.current = false;
    activeSessionId.current = ++nextSessionId;
    setSessionId(activeSessionId.current);
    setNetworkError(requested);
    setSdk(null);
    setStatus('error');
    const label = source === 'default' ? 'Unknown configured default network' : 'Unknown network';
    setError(new SdkSessionError('unknown-network', `${label} "${requested}". Choose a configured network.`));
  }, []);

  // Hydrate the stored preferences after mount. Registry must be loaded first
  // so URL-param / localStorage validation can see custom devnets.
  useEffect(() => {
    initNetworkRegistry();
    const urlNet = readUrlNetwork();
    const validUrlNet = urlNet && hasNetwork(urlNet) ? urlNet : null;
    const storedNet = validUrlNet ?? readStoredNetwork(defaultNetwork);
    if (validUrlNet) {
      // Persist the URL-param choice so a reload without the param keeps it.
      storePreference(NETWORK_KEY, validUrlNet);
    }
    // Migrate the removed trusted-mode toggle: a saved "false" can no longer
    // select a session that fails every proof-bearing query.
    removePreference(LEGACY_TRUSTED_KEY);
    if (urlNet && !validUrlNet) blockUnknownNetwork(urlNet, 'url');
    else if (!hasNetwork(storedNet)) blockUnknownNetwork(storedNet, 'default');
    if (storedNet !== defaultNetwork) setNetworkState(storedNet);
    setConnectionSettingsState(readStoredConnectionSettings());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (net: Network, settings: ConnectionSettings) => {
      sessionController.current?.abort();
      const controller = new AbortController();
      sessionController.current = controller;
      const attemptId = ++nextSessionId;
      activeSessionId.current = attemptId;
      connecting.current = true;
      const settle = () => { if (activeSessionId.current === attemptId) connecting.current = false; };
      setSessionId(attemptId);
      setSessionSignal(controller.signal);
      setSdk(null);
      setStatus('connecting');
      setError(null);
      const currentLogLevel = () => settingsRef.current.logLevel;
      let instance: EvoSDKType;
      try {
        instance = await constructSdk(net, settings, attemptId, controller.signal);
      } catch (err) {
        settle();
        if (controller.signal.aborted) return;
        const normalized = normalizeError(err);
        setError(new SdkSessionError('failed', normalized.message, { cause: err }));
        setStatus('error');
        return;
      }
      if (controller.signal.aborted) return settle();
      const connectingSdk = Promise.resolve().then(() => instance.connect());
      try {
        const seconds = Math.round(settings.startupTimeoutMs / 1000);
        await measureSdkPhase('connect', attemptId, controller.signal, () => withDeadline(
          connectingSdk,
          settings.startupTimeoutMs,
          () => new SdkSessionError('timeout', `Timed out after ${seconds} s connecting to Dash Platform: the trusted quorum service (${getQuorumKeySource(net, resolveQuorumUrl(net, settings))}) did not answer.`),
        ));
      } catch (err) {
        settle();
        releaseUnpublished(instance, connectingSdk, currentLogLevel);
        if (controller.signal.aborted) return;
        const sessionError = err instanceof SdkSessionError
          ? err
          : new SdkSessionError('unreachable', normalizeError(err).message, { cause: err });
        setError(sessionError);
        setStatus('error');
        return;
      }
      settle();
      if (controller.signal.aborted) {
        releaseUnpublished(instance, connectingSdk, currentLogLevel);
        return;
      }
      setSdk(instance);
      setStatus('ready');
    },
    [],
  );

  useEffect(() => () => {
    sessionController.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated || networkError !== null) return;
    void connect(network, settingsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, optionsKey, hydrated, networkError]);

  // Queries are keyed by session and their functions capture that session's
  // SDK. Drop retired sessions' cache entries (and with them the last
  // references to the old SDK) instead of keeping them for the 24 h gcTime.
  useEffect(() => {
    queryClient?.removeQueries({ predicate: (query) => isRetiredSessionKey(query.queryKey, sessionId) });
  }, [queryClient, sessionId]);

  /** Retire the outgoing session before children see the next selection. The
   *  connect-on-change effect starts the new session after this state commits. */
  const retireSession = useCallback(() => {
    sessionController.current?.abort();
    setSdk(null);
    setStatus('connecting');
    setError(null);
  }, []);

  const setNetwork = useCallback((next: Network) => {
    initNetworkRegistry();
    if (!hasNetwork(next)) {
      blockUnknownNetwork(next, 'selection');
      return;
    }
    if (networkRef.current === next && !networkErrorRef.current) return;
    storePreference(NETWORK_KEY, next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('network')) {
        url.searchParams.set('network', next);
        // Passing Next's internal __NA state makes it skip useSearchParams
        // synchronization. Let the patched API copy router state itself.
        window.history.replaceState(null, '', url);
      }
    }
    networkErrorRef.current = null;
    setNetworkError(null);
    networkRef.current = next;
    retireSession();
    setNetworkState(next);
  }, [blockUnknownNetwork, retireSession]);

  const syncUrlNetwork = useCallback((requested: string | null) => {
    if (requested && !hasNetwork(requested)) {
      blockUnknownNetwork(requested, 'url');
    } else if (requested) {
      setNetwork(requested);
    } else if (networkErrorRef.current?.source === 'url') {
      if (hasNetwork(networkRef.current)) {
        networkErrorRef.current = null;
        setNetworkError(null);
      } else {
        blockUnknownNetwork(networkRef.current, 'default');
      }
    }
  }, [blockUnknownNetwork, setNetwork]);

  const setConnectionSettings = useCallback((next: ConnectionSettings) => {
    const parsed = parseConnectionSettings(next);
    if (sameConnectionSettings(settingsRef.current, parsed)) return;
    storePreference(CONNECTION_SETTINGS_KEY, JSON.stringify(parsed));
    const changesSession = sessionOptionsKey(networkRef.current, settingsRef.current) !== sessionOptionsKey(networkRef.current, parsed);
    settingsRef.current = parsed;
    setConnectionSettingsState(parsed);
    if (changesSession && !networkErrorRef.current) retireSession();
  }, [retireSession]);

  // Many failed cards may retry at once; one connection attempt serves them all.
  const reconnect = useCallback(() => {
    if (networkErrorRef.current || connecting.current) return;
    void connect(networkRef.current, settingsRef.current);
  }, [connect]);

  const reportUnreachable = useCallback((reportedSessionId: number, failure: unknown | null) => {
    if (reportedSessionId !== activeSessionId.current) return;
    setUnreachable(failure === null ? null : {
      sessionId: reportedSessionId,
      error: new SdkSessionError('unreachable', `No DAPI endpoint answered: ${normalizeError(failure).message}`, { cause: failure }),
    });
  }, []);

  const quorumUrl = hasNetwork(network) ? resolveQuorumUrl(network, connectionSettings) : null;
  const value = useMemo<SdkContextValue>(
    () => ({
      sdk,
      status,
      network,
      trusted: true,
      quorumUrl,
      connectionSettings,
      sessionId,
      sessionSignal,
      error,
      unreachable: unreachable?.sessionId === sessionId ? unreachable.error : null,
      setNetwork,
      setConnectionSettings,
      reconnect,
      reportUnreachable,
    }),
    [sdk, status, network, quorumUrl, connectionSettings, sessionId, sessionSignal, error, unreachable, setNetwork, setConnectionSettings, reconnect, reportUnreachable],
  );

  return (
    <SdkContext.Provider value={value}>
      {hydrated && <Suspense fallback={null}><UrlNetworkSync onChange={syncUrlNetwork} /></Suspense>}
      {children}
    </SdkContext.Provider>
  );
}
