'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EvoSDK as EvoSDKType } from '@dashevo/evo-sdk';
import { DEFAULT_NETWORK, type Network } from './networks';
import { getConfig } from '@/config';

export type SdkStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface SdkContextValue {
  sdk: EvoSDKType | null;
  status: SdkStatus;
  network: Network;
  trusted: boolean;
  error: Error | null;
  setNetwork: (n: Network) => void;
  setTrusted: (t: boolean) => void;
  reconnect: () => void;
}

export const SdkContext = createContext<SdkContextValue | null>(null);

const NETWORK_KEY = 'npe:network';
const TRUSTED_KEY = 'npe:trusted';

function readStoredNetwork(fallback: Network): Network {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(NETWORK_KEY);
  return raw === 'mainnet' || raw === 'testnet' ? raw : fallback;
}

function readStoredTrusted(fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(TRUSTED_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

async function constructSdk(network: Network, trusted: boolean): Promise<EvoSDKType> {
  // Dynamically import so the heavy WASM module does not block the initial app paint.
  const mod = await import('@dashevo/evo-sdk');
  const EvoSDK = mod.EvoSDK;
  if (network === 'mainnet') {
    return trusted ? EvoSDK.mainnetTrusted() : EvoSDK.mainnet();
  }
  return trusted ? EvoSDK.testnetTrusted() : EvoSDK.testnet();
}

export function SdkProvider({ children }: { children: ReactNode }) {
  const config = getConfig();
  // Initial state is the build-time / env fallback so SSR + first client render
  // agree (otherwise hydration mismatches: server sees window=undefined and
  // returns the fallback, client reads localStorage and may return the other
  // choice). After hydration the useEffect below pulls the stored values in.
  const defaultNetwork: Network = config.defaultNetwork ?? DEFAULT_NETWORK;
  const defaultTrusted = config.trustedMode;
  const [network, setNetworkState] = useState<Network>(defaultNetwork);
  const [trusted, setTrustedState] = useState<boolean>(defaultTrusted);
  const [sdk, setSdk] = useState<EvoSDKType | null>(null);
  const [status, setStatus] = useState<SdkStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const connectSeq = useRef(0);

  // Hydrate the stored preferences after mount. Both writes fire synchronously
  // in a single render cycle, so the SDK connect useEffect below sees the
  // final (network, trusted) pair.
  useEffect(() => {
    const storedNet = readStoredNetwork(defaultNetwork);
    const storedTrust = readStoredTrusted(defaultTrusted);
    if (storedNet !== defaultNetwork) setNetworkState(storedNet);
    if (storedTrust !== defaultTrusted) setTrustedState(storedTrust);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (net: Network, isTrusted: boolean) => {
      const seq = ++connectSeq.current;
      setStatus('connecting');
      setError(null);
      try {
        const instance = await constructSdk(net, isTrusted);
        await instance.connect();
        if (seq !== connectSeq.current) return; // superseded
        setSdk(instance);
        setStatus('ready');
      } catch (err) {
        if (seq !== connectSeq.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    },
    [],
  );

  useEffect(() => {
    void connect(network, trusted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, trusted]);

  const setNetwork = useCallback((next: Network) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NETWORK_KEY, next);
    }
    setNetworkState(next);
  }, []);

  const setTrusted = useCallback((next: boolean) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TRUSTED_KEY, String(next));
    }
    setTrustedState(next);
  }, []);

  const reconnect = useCallback(() => {
    void connect(network, trusted);
  }, [connect, network, trusted]);

  const value = useMemo<SdkContextValue>(
    () => ({ sdk, status, network, trusted, error, setNetwork, setTrusted, reconnect }),
    [sdk, status, network, trusted, error, setNetwork, setTrusted, reconnect],
  );

  return <SdkContext.Provider value={value}>{children}</SdkContext.Provider>;
}
