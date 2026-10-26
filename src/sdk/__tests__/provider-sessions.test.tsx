import React, { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SdkProvider, type SdkContextValue } from '../SdkProvider';
import { useSdk } from '../hooks';
import { createMockSdk } from '@/test/sdk';
import { installStorageMock } from '@/test/storage';
import { removeCustomDevnet } from '../networks';
import { SdkSessionError } from '../errors';

const { factory, mainnetFactory, testnetFactory } = vi.hoisted(() => ({
  factory: vi.fn(), mainnetFactory: vi.fn(), testnetFactory: vi.fn(),
}));
// The provider builds every session with `new EvoSDK(options)`; route by network.
vi.mock('@dashevo/evo-sdk', () => ({
  EvoSDK: vi.fn(function EvoSDK(options: { network: string }) {
    if (options.network === 'mainnet') return mainnetFactory(options);
    if (options.network === 'testnet') return testnetFactory(options);
    return factory(options);
  }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

let context: SdkContextValue;
function Probe() {
  const value = useSdk();
  useEffect(() => { context = value; }, [value]);
  return <div data-testid="sdk-state">{value.network}:{value.status}:{String(value.trusted)}</div>;
}
function App() { return <SdkProvider><Probe /></SdkProvider>; }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
  factory.mockImplementation(() => createMockSdk());
  mainnetFactory.mockImplementation((options) => factory(options));
  testnetFactory.mockImplementation((options) => factory(options));
});

const CUSTOM_NETWORK = 'devnet-data-followup';
const CUSTOM_CONFIG = {
  type: 'devnet',
  name: CUSTOM_NETWORK,
  label: 'Data follow-up',
  devnetName: 'data-followup',
  quorumUrl: 'https://quorums.example.test',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  installStorageMock('localStorage');
  removeCustomDevnet(CUSTOM_NETWORK);
});

describe('SDK provider connection lifecycle', () => {
  it('shows the message behind structured SDK error getters and retains the original cause', async () => {
    // Matches the pinned SDK's real failed-quorum error: not an Error, only
    // __wbg_ptr enumerable, and all meaningful fields on prototype getters.
    class WasmSdkError {
      __wbg_ptr = 1;
      get message() { return 'Failed to prefetch quorums: HTTP request error: error sending request'; }
      get name() { return 'Generic'; }
      get kind() { return 17; }
      get code() { return -1; }
      get isRetriable() { return false; }
    }
    const failure = new WasmSdkError();
    expect(String(failure)).toBe('[object Object]');
    factory.mockReturnValueOnce(createMockSdk({ connect: vi.fn().mockRejectedValue(failure) }));
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(context.error?.message).toContain(failure.message);
    expect(context.error?.message).not.toContain('[object Object]');
    expect(context.error).toBeInstanceOf(SdkSessionError);
    expect((context.error as SdkSessionError).reason).toBe('unreachable');
    expect(context.error?.cause).toBe(failure);
  });

  it('clears the ready SDK, aborts its session, and creates a new session on reconnect', async () => {
    const oldSdk = createMockSdk();
    const connection = deferred();
    const nextSdk = createMockSdk({ connect: vi.fn().mockReturnValue(connection.promise) });
    factory.mockReturnValueOnce(oldSdk).mockReturnValueOnce(nextSdk);
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const oldId = context.sessionId;
    const oldSignal = context.sessionSignal!;
    act(() => context.reconnect());
    expect(oldSignal.aborted).toBe(true);
    expect(context.sdk).toBeNull();
    expect(context.status).toBe('connecting');
    expect(context.sessionId).not.toBe(oldId);
    await waitFor(() => expect(nextSdk.connect).toHaveBeenCalledOnce());
    await act(async () => { connection.resolve(); await connection.promise; });
    await waitFor(() => expect(context.sdk).toBe(nextSdk));
    expect(context.status).toBe('ready');
  });

  it('ignores a superseded connection that completes after switching network', async () => {
    const connection = deferred();
    const oldSdk = createMockSdk({ connect: vi.fn().mockReturnValue(connection.promise) });
    const nextSdk = createMockSdk();
    factory.mockReturnValueOnce(oldSdk).mockReturnValueOnce(nextSdk);
    render(<App />);
    await waitFor(() => expect(oldSdk.connect).toHaveBeenCalledOnce());
    const oldSignal = context.sessionSignal!;
    act(() => context.setNetwork('mainnet'));
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(context.sdk).toBe(nextSdk));
    await act(async () => { connection.resolve(); await connection.promise; });
    expect(context.network).toBe('mainnet');
    expect(context.sdk).toBe(nextSdk);
  });

  it('aborts the active session on connection-setting changes and on unmount', async () => {
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const oldId = context.sessionId;
    const oldSignal = context.sessionSignal!;
    act(() => context.setConnectionSettings({ ...context.connectionSettings, retries: 2 }));
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.trusted).toBe(true);
    expect(context.sessionId).not.toBe(oldId);
    expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ trusted: true, settings: { retries: 2 } }));
    expect(JSON.parse(window.localStorage.getItem('npe:connectionSettings')!)).toMatchObject({ retries: 2 });
    const activeSignal = context.sessionSignal!;
    view.unmount();
    expect(activeSignal.aborted).toBe(true);
  });
});

describe('network-aware links', () => {
  it('connects only to the initial URL network instead of the fallback', async () => {
    window.history.replaceState(null, '', '/?network=mainnet');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
  });

  it('switches to the network in a link during client navigation', async () => {
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const previousSignal = context.sessionSignal!;
    window.history.pushState(null, '', '/identity/?id=test&network=mainnet');
    view.rerender(<App />);
    await waitFor(() => expect(screen.getByTestId('sdk-state')).toHaveTextContent('mainnet:ready'));
    expect(previousSignal.aborted).toBe(true);
    expect(mainnetFactory).toHaveBeenCalledOnce();
  });

  it('visibly rejects unknown initial networks, preserves that error on setting changes, and recovers via network selection', async () => {
    window.history.replaceState(null, '', '/?network=unknown-network');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(context.error?.message).toContain('Unknown network "unknown-network"');
    expect((context.error as SdkSessionError).reason).toBe('unknown-network');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.setConnectionSettings({ ...context.connectionSettings, retries: 1 }));
    expect(context.status).toBe('error');
    expect(context.error?.message).toContain('unknown-network');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.setNetwork('testnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(new URL(window.location.href).searchParams.get('network')).toBe('testnet');
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ settings: { retries: 1 } }));
    expect(context.error).toBeNull();
  });

  it('aborts a ready session and visibly rejects an unknown network during navigation', async () => {
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const previousSignal = context.sessionSignal!;
    window.history.pushState(null, '', '/?network=unknown-network');
    view.rerender(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(previousSignal.aborted).toBe(true);
    expect(context.sdk).toBeNull();
    expect(context.error?.message).toContain('Unknown network "unknown-network"');
    expect(factory).toHaveBeenCalledOnce();
  });
});

describe('configured and explicit network validation', () => {
  it('blocks an unknown configured default until a configured network is selected', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'unknown-default');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(context.sdk).toBeNull();
    expect(context.error?.message).toContain('Unknown configured default network "unknown-default"');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.reconnect());
    expect(context.status).toBe('error');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.setNetwork('mainnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
  });

  it.each(['URL', 'stored'] as const)('allows a valid %s network to override an unknown configured default', async (source) => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'unknown-default');
    if (source === 'URL') window.history.replaceState(null, '', '/?network=mainnet');
    else window.localStorage.setItem('npe:network', 'mainnet');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
  });

  it('rejects direct unknown network selection without persisting it or connecting to fallback testnet', async () => {
    window.localStorage.setItem('npe:network', 'mainnet');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const oldSignal = context.sessionSignal!;
    act(() => context.setNetwork('unknown-selection'));
    expect(context.status).toBe('error');
    expect(context.sdk).toBeNull();
    expect(oldSignal.aborted).toBe(true);
    expect(context.error?.message).toContain('Unknown network "unknown-selection"');
    expect(window.localStorage.getItem('npe:network')).toBe('mainnet');
    act(() => context.reconnect());
    expect(factory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
    act(() => context.setNetwork('mainnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledTimes(2);
    expect(context.error).toBeNull();
  });

  it('restores the invalid-default error when an unknown URL network is removed', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'unknown-default');
    window.history.replaceState(null, '', '/?network=unknown-link');
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(context.error?.message).toContain('unknown-link');
    window.history.replaceState(null, '', '/');
    view.rerender(<App />);
    await waitFor(() => expect(context.error?.message).toContain('Unknown configured default network "unknown-default"'));
    expect(factory).not.toHaveBeenCalled();
  });

  it('validates a configured custom devnet after loading the saved registry', async () => {
    window.localStorage.setItem('npe:customDevnets', JSON.stringify([CUSTOM_CONFIG]));
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', CUSTOM_NETWORK);
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe(CUSTOM_NETWORK);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ network: 'devnet', trusted: true, devnetName: 'data-followup', quorumUrl: 'https://quorums.example.test' }));
    expect(testnetFactory).not.toHaveBeenCalled();
  });

  it('supports URL navigation to a saved custom devnet after hydration', async () => {
    window.localStorage.setItem('npe:customDevnets', JSON.stringify([CUSTOM_CONFIG]));
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    window.history.pushState(null, '', `/?network=${CUSTOM_NETWORK}`);
    view.rerender(<App />);
    await waitFor(() => expect(context.network).toBe(CUSTOM_NETWORK));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ network: 'devnet', devnetName: 'data-followup', quorumUrl: 'https://quorums.example.test' }));
  });
});

describe('optional browser preference storage', () => {
  it('ignores a stale saved network name and uses the configured default', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'mainnet');
    window.localStorage.setItem('npe:network', 'removed-devnet');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
  });

  it('uses configured defaults when localStorage access itself is blocked', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'mainnet');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(mainnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).not.toHaveBeenCalled();
    act(() => context.setNetwork('testnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('testnet');
    act(() => context.setConnectionSettings({ ...context.connectionSettings, logLevel: 'error' }));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(testnetFactory).toHaveBeenLastCalledWith(expect.objectContaining({ logs: 'error' }));
  });

  it('keeps a URL-selected network and setting changes usable when reads and writes throw', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Read blocked', 'SecurityError'); });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    window.history.replaceState(null, '', '/?network=mainnet');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('mainnet');
    expect(testnetFactory).not.toHaveBeenCalled();
    act(() => context.setNetwork('testnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.network).toBe('testnet');
    expect(new URL(window.location.href).searchParams.get('network')).toBe('testnet');
    act(() => context.setConnectionSettings({ ...context.connectionSettings, retries: 3 }));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.connectionSettings.retries).toBe(3);
  });

  it('keeps an invalid configured default blocked when storage is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_NETWORK', 'unknown-default');
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(context.error?.message).toContain('unknown-default');
    expect(factory).not.toHaveBeenCalled();
  });
});

describe('session resilience', () => {
  it('discards the removed trusted-mode preference and still connects trusted', async () => {
    window.localStorage.setItem('npe:trusted', 'false');
    vi.stubEnv('NEXT_PUBLIC_TRUSTED_MODE', 'false');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.trusted).toBe(true);
    expect(window.localStorage.getItem('npe:trusted')).toBeNull();
    expect(testnetFactory).toHaveBeenCalledWith(expect.objectContaining({ network: 'testnet', trusted: true }));
  });

  it('restores stored connection settings before the first connect', async () => {
    window.localStorage.setItem('npe:connectionSettings', JSON.stringify({ requestTimeoutMs: 4000, quorumUrls: { testnet: 'https://quorums.example.test' } }));
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(testnetFactory).toHaveBeenCalledOnce();
    expect(testnetFactory).toHaveBeenCalledWith(expect.objectContaining({ quorumUrl: 'https://quorums.example.test', settings: { timeoutMs: 4000 } }));
    expect(context.quorumUrl).toBe('https://quorums.example.test');
  });

  it('fails a hung connect after the startup timeout and frees the instance if it completes later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const hung = deferred();
      const free = vi.fn();
      const late = createMockSdk({ connect: vi.fn().mockReturnValue(hung.promise), isConnected: true, wasm: { free } });
      factory.mockReturnValueOnce(late);
      window.localStorage.setItem('npe:connectionSettings', JSON.stringify({ startupTimeoutMs: 2000 }));
      render(<App />);
      await waitFor(() => expect(late.connect).toHaveBeenCalledOnce());
      await act(async () => { await vi.advanceTimersByTimeAsync(2001); });
      await waitFor(() => expect(context.status).toBe('error'));
      expect((context.error as SdkSessionError).reason).toBe('timeout');
      expect(context.error?.message).toMatch(/Timed out after 2 s connecting to Dash Platform/);
      expect(context.sdk).toBeNull();
      expect(free).not.toHaveBeenCalled();
      await act(async () => { hung.resolve(); await hung.promise; });
      await waitFor(() => expect(free).toHaveBeenCalledOnce());
      expect(context.sdk).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('frees a superseded instance that was never published', async () => {
    const connection = deferred();
    const free = vi.fn();
    const superseded = createMockSdk({ connect: vi.fn().mockReturnValue(connection.promise), isConnected: true, wasm: { free } });
    const current = createMockSdk();
    factory.mockReturnValueOnce(superseded).mockReturnValueOnce(current);
    render(<App />);
    await waitFor(() => expect(superseded.connect).toHaveBeenCalledOnce());
    act(() => context.setNetwork('mainnet'));
    await waitFor(() => expect(context.sdk).toBe(current));
    await act(async () => { connection.resolve(); await connection.promise; });
    await waitFor(() => expect(free).toHaveBeenCalledOnce());
  });

  it('flags the current session unreachable when every endpoint failed, without discarding it', async () => {
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    act(() => context.reportUnreachable(context.sessionId - 1, new Error('no available addresses to retry')));
    expect(context.unreachable).toBeNull();
    const signal = context.sessionSignal!;
    act(() => context.reportUnreachable(context.sessionId, new Error('no available addresses to retry, last error: fetch failed')));
    expect(context.status).toBe('ready');
    expect(signal.aborted).toBe(false);
    expect((context.unreachable as SdkSessionError).reason).toBe('unreachable');
    expect(context.unreachable?.message).toMatch(/No DAPI endpoint answered/);
    act(() => context.reportUnreachable(context.sessionId, null));
    expect(context.unreachable).toBeNull();
    act(() => context.reportUnreachable(context.sessionId, new Error('no available addresses to retry')));
    act(() => context.reconnect());
    expect(context.unreachable).toBeNull();
    await waitFor(() => expect(context.status).toBe('ready'));
  });

  it('keeps the session when a setting does not change the SDK it would build', async () => {
    render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const id = context.sessionId;
    act(() => context.setConnectionSettings({ ...context.connectionSettings, quorumUrls: { mainnet: 'https://quorums.example.test', testnet: null } }));
    act(() => context.setConnectionSettings({ ...context.connectionSettings, startupTimeoutMs: 45_000 }));
    expect(context.status).toBe('ready');
    expect(context.sessionId).toBe(id);
    expect(testnetFactory).toHaveBeenCalledOnce();
    expect(context.connectionSettings.startupTimeoutMs).toBe(45_000);
  });

  it('coalesces reconnect requests while a connection is in flight', async () => {
    const connection = deferred();
    factory.mockReturnValueOnce(createMockSdk({ connect: vi.fn().mockRejectedValue(new Error('Failed to prefetch quorums')) }))
      .mockReturnValueOnce(createMockSdk({ connect: vi.fn().mockReturnValue(connection.promise) }));
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    act(() => { context.reconnect(); context.reconnect(); context.reconnect(); });
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    act(() => context.reconnect());
    expect(factory).toHaveBeenCalledTimes(2);
    await act(async () => { connection.resolve(); await connection.promise; });
    await waitFor(() => expect(context.status).toBe('ready'));
  });

  it('removes cache entries of retired sessions but keeps network-scoped ones', async () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    await waitFor(() => expect(context.status).toBe('ready'));
    const first = context.sessionId;
    client.setQueryData(['npe', 'testnet', true, first, 'identities', 'fetch', 'x'], 'old');
    client.setQueryData(['npe', 'testnet', 'core-status'], 'core');
    act(() => context.reconnect());
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.sessionId).not.toBe(first);
    expect(client.getQueryData(['npe', 'testnet', true, first, 'identities', 'fetch', 'x'])).toBeUndefined();
    expect(client.getQueryData(['npe', 'testnet', 'core-status'])).toBe('core');
    client.clear();
  });
});
