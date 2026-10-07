'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertIcon } from '@chakra-ui/react';
import type { EvoSDK as EvoSDKType } from '@dashevo/evo-sdk';
import {
  DEFAULT_NETWORK,
  devnetShortName,
  getNetwork,
  hasNetwork,
  initNetworkRegistry,
  type Network,
} from './networks';
import { getConfig } from '@/config';
import { measureSdkPhase } from './timing';

/** Shape of the devnet args we hand to `EvoSDK.devnet` / `EvoSDK.devnetTrusted`.
 *  Exported only so the SdkProvider unit test can pin the resolution rules. */
export type DevnetSdkArgs =
  | { trusted: false; name: string; addresses: string[] }
  | { trusted: true; name: string; quorumUrl?: string };

export function getDevnetSdkArgs(network: Network, trusted: boolean): DevnetSdkArgs {
  const cfg = getNetwork(network);
  if (cfg.type !== 'devnet') {
    throw new Error(`Network "${network}" is not a devnet`);
  }
  const name = devnetShortName(cfg);
  if (trusted) {
    // `EvoSDK.devnetTrusted` discovers DAPI addresses via the quorums service,
    // so explicit `addresses` from the network config are ignored here. Pass a
    // `quorumUrl` only when overridden; otherwise the SDK derives the default.
    return cfg.quorumUrl
      ? { trusted: true, name, quorumUrl: cfg.quorumUrl }
      : { trusted: true, name };
  }
  // Non-trusted devnet: SDK has no way to find masternodes without a trusted
  // context, so explicit `dapiAddresses` are mandatory.
  if (!cfg.dapiAddresses || cfg.dapiAddresses.length === 0) {
    throw new Error(
      `Devnet "${cfg.name}" has no DAPI addresses configured (required for non-trusted mode)`,
    );
  }
  return { trusted: false, name, addresses: cfg.dapiAddresses };
}

export type SdkStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface SdkContextValue {
  sdk: EvoSDKType | null;
  status: SdkStatus;
  network: Network;
  trusted: boolean;
  /** Changes for every connection attempt, including same-network reconnects. */
  sessionId: number;
  /** Aborted synchronously when this connection is superseded or unmounted. */
  sessionSignal: AbortSignal | null;
  error: Error | null;
  setNetwork: (n: Network) => void;
  setTrusted: (t: boolean) => void;
  reconnect: () => void;
}

export const SdkContext = createContext<SdkContextValue | null>(null);

const NETWORK_KEY = 'npe:network';
const TRUSTED_KEY = 'npe:trusted';
// Unique across provider remounts sharing the same React Query client too.
let nextSessionId = 0;

function readStoredNetwork(fallback: Network): Network {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(NETWORK_KEY);
  return raw && hasNetwork(raw) ? raw : fallback;
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

function readStoredTrusted(fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(TRUSTED_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

async function constructSdk(
  network: Network,
  trusted: boolean,
  sessionId: number,
  signal: AbortSignal,
): Promise<EvoSDKType> {
  // Dynamically import so the heavy WASM module does not block the initial app paint.
  const mod = await measureSdkPhase('module-load', sessionId, signal, () => import('@dashevo/evo-sdk'));
  return measureSdkPhase('construct', sessionId, signal, () => {
    const EvoSDK = mod.EvoSDK;
    const cfg = getNetwork(network);
    if (cfg.type === 'mainnet') {
      return trusted ? EvoSDK.mainnetTrusted() : EvoSDK.mainnet();
    }
    if (cfg.type === 'testnet') {
      return trusted ? EvoSDK.testnetTrusted() : EvoSDK.testnet();
    }
    // Devnet: dev.7+ SDK has first-class devnet factories. Trusted mode uses
    // the quorums service for proof verification + masternode discovery;
    // non-trusted mode requires explicit DAPI addresses.
    const args = getDevnetSdkArgs(network, trusted);
    return args.trusted
      ? EvoSDK.devnetTrusted(args.name, args.quorumUrl ? { quorumUrl: args.quorumUrl } : undefined)
      : EvoSDK.devnet(args.name, { addresses: args.addresses });
  });
}

export function SdkProvider({ children }: { children: ReactNode }) {
  const config = getConfig();
  // Initial state is the build-time / env fallback so SSR + first client render
  // agree (otherwise hydration mismatches: server sees window=undefined and
  // returns the fallback, client reads localStorage and may return the other
  // choice). After hydration the useEffect below pulls the stored values in.
  const defaultNetwork: Network = config?.defaultNetwork ?? DEFAULT_NETWORK;
  const defaultTrusted = config?.trustedMode ?? true;
  const [network, setNetworkState] = useState<Network>(defaultNetwork);
  const [trusted, setTrustedState] = useState<boolean>(defaultTrusted);
  const [sdk, setSdk] = useState<EvoSDKType | null>(null);
  const [status, setStatus] = useState<SdkStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [sessionId, setSessionId] = useState(0);
  const [sessionSignal, setSessionSignal] = useState<AbortSignal | null>(null);
  const sessionController = useRef<AbortController | null>(null);
  // Mirror the (network, trusted) selection so `setNetwork` / `setTrusted` can
  // detect no-op calls without re-creating the callback every render.
  const networkRef = useRef(network);
  networkRef.current = network;
  const trustedRef = useRef(trusted);
  trustedRef.current = trusted;
  // Gate the first connect on the URL/localStorage hydration below. Without
  // this, every mount starts a connect against the SSR-fallback network
  // (testnet) before the effect can swap it to a devnet, which not only
  // wastes a build but kicks off the testnet trusted-context prefetch
  // (`quorums.testnet.networks.dash.org/*`) — making it look like devnet
  // pages are still talking to testnet.
  const [hydrated, setHydrated] = useState(false);
  const [urlNetworkError, setUrlNetworkError] = useState<string | null>(null);
  const urlNetworkErrorRef = useRef(false);

  const blockUnknownNetwork = useCallback((requested: string) => {
    urlNetworkErrorRef.current = true;
    sessionController.current?.abort();
    setSessionId(++nextSessionId);
    setUrlNetworkError(requested);
    setSdk(null);
    setStatus('error');
    setError(new Error(`Unknown network "${requested}". Choose a configured network.`));
  }, []);

  // Hydrate the stored preferences after mount. Registry must be loaded first
  // so URL-param / localStorage validation can see custom devnets.
  useEffect(() => {
    initNetworkRegistry();
    const urlNet = readUrlNetwork();
    const validUrlNet = urlNet && hasNetwork(urlNet) ? urlNet : null;
    const storedNet = validUrlNet ?? readStoredNetwork(defaultNetwork);
    const storedTrust = readStoredTrusted(defaultTrusted);
    if (validUrlNet) {
      // Persist the URL-param choice so a reload without the param keeps it.
      window.localStorage.setItem(NETWORK_KEY, validUrlNet);
    }
    if (urlNet && !validUrlNet) blockUnknownNetwork(urlNet);
    if (storedNet !== defaultNetwork) setNetworkState(storedNet);
    if (storedTrust !== defaultTrusted) setTrustedState(storedTrust);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (net: Network, isTrusted: boolean) => {
      sessionController.current?.abort();
      const controller = new AbortController();
      sessionController.current = controller;
      const attemptId = ++nextSessionId;
      setSessionId(attemptId);
      setSessionSignal(controller.signal);
      setSdk(null);
      setStatus('connecting');
      setError(null);
      try {
        const instance = await constructSdk(net, isTrusted, attemptId, controller.signal);
        if (controller.signal.aborted) return;
        await measureSdkPhase('connect', attemptId, controller.signal, () => instance.connect());
        if (controller.signal.aborted) return;
        setSdk(instance);
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    },
    [],
  );

  useEffect(() => () => {
    sessionController.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated || urlNetworkError !== null) return;
    void connect(network, trusted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, trusted, hydrated, urlNetworkError]);

  const setNetwork = useCallback((next: Network) => {
    if (networkRef.current === next && !urlNetworkErrorRef.current) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NETWORK_KEY, next);
      const url = new URL(window.location.href);
      if (url.searchParams.has('network')) {
        url.searchParams.set('network', next);
        // Passing Next's internal __NA state makes it skip useSearchParams
        // synchronization. Let the patched API copy router state itself.
        window.history.replaceState(null, '', url);
      }
    }
    urlNetworkErrorRef.current = false;
    setUrlNetworkError(null);
    // Retire outgoing requests before children see the next selection. The
    // connect-on-change effect starts a new session after this state commits.
    networkRef.current = next;
    sessionController.current?.abort();
    setSdk(null);
    setStatus('connecting');
    setError(null);
    setNetworkState(next);
  }, []);

  const syncUrlNetwork = useCallback((requested: string | null) => {
    if (requested && !hasNetwork(requested)) {
      blockUnknownNetwork(requested);
    } else if (requested) {
      setNetwork(requested);
    } else {
      urlNetworkErrorRef.current = false;
      setUrlNetworkError(null);
    }
  }, [blockUnknownNetwork, setNetwork]);

  const setTrusted = useCallback((next: boolean) => {
    if (trustedRef.current === next) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TRUSTED_KEY, String(next));
    }
    trustedRef.current = next;
    setTrustedState(next);
    if (urlNetworkErrorRef.current) return;
    sessionController.current?.abort();
    setSdk(null);
    setStatus('connecting');
    setError(null);
  }, []);

  const reconnect = useCallback(() => {
    if (urlNetworkErrorRef.current) return;
    void connect(network, trusted);
  }, [connect, network, trusted]);

  const value = useMemo<SdkContextValue>(
    () => ({
      sdk,
      status,
      network,
      trusted,
      sessionId,
      sessionSignal,
      error,
      setNetwork,
      setTrusted,
      reconnect,
    }),
    [sdk, status, network, trusted, sessionId, sessionSignal, error, setNetwork, setTrusted, reconnect],
  );

  return (
    <SdkContext.Provider value={value}>
      {hydrated && <Suspense fallback={null}><UrlNetworkSync onChange={syncUrlNetwork} /></Suspense>}
      {error && <Alert status="error" role="alert"><AlertIcon /><AlertDescription>{error.message}</AlertDescription></Alert>}
      {children}
    </SdkContext.Provider>
  );
}
