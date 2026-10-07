import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdkProvider, type SdkContextValue } from '../SdkProvider';
import { useSdk } from '../hooks';
import { createMockSdk } from '@/test/sdk';

const { factory, mainnetFactory, testnetFactory } = vi.hoisted(() => ({
  factory: vi.fn(), mainnetFactory: vi.fn(), testnetFactory: vi.fn(),
}));
vi.mock('@dashevo/evo-sdk', () => ({ EvoSDK: {
  mainnet: (...args: unknown[]) => mainnetFactory(...args),
  mainnetTrusted: (...args: unknown[]) => mainnetFactory(...args),
  testnet: (...args: unknown[]) => testnetFactory(...args),
  testnetTrusted: (...args: unknown[]) => testnetFactory(...args),
  devnet: (...args: unknown[]) => factory(...args),
  devnetTrusted: (...args: unknown[]) => factory(...args),
} }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

let context: SdkContextValue;
function Probe() {
  context = useSdk();
  return <div data-testid="sdk-state">{context.network}:{context.status}:{String(context.trusted)}</div>;
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
  mainnetFactory.mockImplementation(() => factory());
  testnetFactory.mockImplementation(() => factory());
});

describe('SDK provider connection lifecycle', () => {
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

  it('aborts the active session on trust changes and on unmount', async () => {
    const view = render(<App />);
    await waitFor(() => expect(context.status).toBe('ready'));
    const oldId = context.sessionId;
    const oldSignal = context.sessionSignal!;
    act(() => context.setTrusted(false));
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(context.trusted).toBe(false);
    expect(context.sessionId).not.toBe(oldId);
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

  it('visibly rejects unknown initial networks, preserves that error on trust changes, and recovers via network selection', async () => {
    window.history.replaceState(null, '', '/?network=unknown-network');
    render(<App />);
    await waitFor(() => expect(context.status).toBe('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown network "unknown-network"');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.setTrusted(false));
    expect(context.status).toBe('error');
    expect(context.error?.message).toContain('unknown-network');
    expect(factory).not.toHaveBeenCalled();
    act(() => context.setNetwork('testnet'));
    await waitFor(() => expect(context.status).toBe('ready'));
    expect(new URL(window.location.href).searchParams.get('network')).toBe('testnet');
    expect(context.trusted).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown network "unknown-network"');
    expect(factory).toHaveBeenCalledOnce();
  });
});
