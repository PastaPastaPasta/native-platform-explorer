import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { useSdk } from '@sdk/hooks';
import { installStorageMock } from '@/test/storage';
import { createMockSigner } from '@/test/signer';
import { SignerProvider, useSigner } from '../SignerProvider';

vi.mock('@sdk/hooks', () => ({
  useSdk: vi.fn(),
}));

const useSdkMock = vi.mocked(useSdk);
let firstDestroy: ReturnType<typeof vi.fn>;
let secondDestroy: ReturnType<typeof vi.fn>;

function Harness() {
  const { signer, stash, connect, disconnect, clearStash } = useSigner();
  const first = createMockSigner({ identityId: 'identity-a', kind: 'wif', destroy: firstDestroy });
  const second = createMockSigner({
    identityId: 'identity-b',
    kind: 'mnemonic',
    destroy: secondDestroy,
  });

  return (
    <div>
      <div data-testid="signer">{signer?.identityId ?? 'none'}</div>
      <div data-testid="stash">{stash ? `${stash.kind}:${stash.identityId}` : 'none'}</div>
      <button onClick={() => connect(first)}>connect first</button>
      <button onClick={() => connect(second)}>connect second</button>
      <button onClick={disconnect}>disconnect</button>
      <button onClick={clearStash}>clear stash</button>
    </div>
  );
}

describe('SignerProvider', () => {
  beforeEach(() => {
    firstDestroy = vi.fn();
    secondDestroy = vi.fn();
    installStorageMock('sessionStorage');
    useSdkMock.mockReturnValue({
      ...{ sessionId: 1, sessionSignal: null },
      sdk: null,
      status: 'connecting',
      network: 'testnet',
      trusted: true,
      sessionId: 1,
      sessionSignal: null,
      error: null,
      setNetwork: vi.fn(),
      setTrusted: vi.fn(),
      reconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('persists only signer kind and identity id in the session stash', async () => {
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );

    fireEvent.click(screen.getByText('connect first'));

    expect(screen.getByTestId('signer')).toHaveTextContent('identity-a');
    expect(screen.getByTestId('stash')).toHaveTextContent('wif:identity-a');
    expect(window.sessionStorage.getItem('npe:signer-kind')).toBe(
      JSON.stringify({ kind: 'wif', identityId: 'identity-a' }),
    );
  });

  it('hydrates a previous-session stash without restoring private signer material', async () => {
    installStorageMock('sessionStorage', {
      'npe:signer-kind': JSON.stringify({ kind: 'mnemonic', identityId: 'identity-b' }),
    });

    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stash')).toHaveTextContent('mnemonic:identity-b');
    });
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
  });

  it('destroys replaced and disconnected signer instances', () => {
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );

    fireEvent.click(screen.getByText('connect first'));
    fireEvent.click(screen.getByText('connect second'));
    expect(firstDestroy).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText('disconnect'));
    expect(secondDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
    expect(window.sessionStorage.getItem('npe:signer-kind')).toBeNull();
  });

  it('destroys secrets once on provider unmount, including React strict mode', () => {
    const view = render(
      <React.StrictMode>
        <SignerProvider>
          <Harness />
        </SignerProvider>
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByText('connect first'));
    view.unmount();
    expect(firstDestroy).toHaveBeenCalledOnce();
  });

  it('disconnects on a network change and same-network SDK replacement', () => {
    const context = useSdkMock();
    const view = render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    useSdkMock.mockReturnValue({ ...context, network: 'mainnet' });
    view.rerender(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
    fireEvent.click(screen.getByText('connect second'));
    useSdkMock.mockReturnValue({ ...context, network: 'mainnet', sdk: {} as EvoSDK });
    view.rerender(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(secondDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
  });

  it('disconnects after ten minutes hidden and cancels the timer when visible', () => {
    vi.useFakeTimers();
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(9 * 60_000));
    expect(firstDestroy).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(firstDestroy).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
  });

  it('hydrates backup stashes and wipes live secrets on unload', () => {
    installStorageMock('sessionStorage', {
      'npe:signer-kind': JSON.stringify({ kind: 'backup', identityId: 'identity-a' }),
    });
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(screen.getByTestId('stash')).toHaveTextContent('backup:identity-a');
    fireEvent.click(screen.getByText('connect first'));
    fireEvent(window, new Event('beforeunload'));
    expect(firstDestroy).toHaveBeenCalledOnce();
  });

  it('preserves the reconnect hint while the first SDK session initializes', () => {
    installStorageMock('sessionStorage', {
      'npe:signer-kind': JSON.stringify({ kind: 'backup', identityId: 'identity-a' }),
    });
    const context = useSdkMock();
    const view = render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    useSdkMock.mockReturnValue({ ...context, sdk: {} as EvoSDK, status: 'ready' });
    view.rerender(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(screen.getByTestId('stash')).toHaveTextContent('backup:identity-a');
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
  });

  it('rejects pending connections after disconnect, unmount, or a changed network', () => {
    let current!: ReturnType<typeof useSigner>;
    function Capture() {
      current = useSigner();
      return null;
    }
    const context = useSdkMock();
    const view = render(
      <SignerProvider>
        <Capture />
      </SignerProvider>,
    );
    const pendingConnect = current.connect;
    act(() => current.disconnect());
    const stale = createMockSigner({ destroy: firstDestroy });
    expect(() => pendingConnect(stale)).toThrow(/session changed/);
    expect(firstDestroy).toHaveBeenCalledOnce();
    const networkConnect = current.connect;
    useSdkMock.mockReturnValue({ ...context, network: 'mainnet' });
    view.rerender(
      <SignerProvider>
        <Capture />
      </SignerProvider>,
    );
    expect(() => networkConnect(createMockSigner({ destroy: secondDestroy }))).toThrow(
      /session changed/,
    );
    expect(secondDestroy).toHaveBeenCalledOnce();
    const unmountedConnect = current.connect;
    view.unmount();
    const destroyed = vi.fn();
    expect(() => unmountedConnect(createMockSigner({ destroy: destroyed }))).toThrow(
      /session changed/,
    );
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('keeps live signing usable when browser storage is blocked', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    expect(screen.getByTestId('signer')).toHaveTextContent('identity-a');
    fireEvent.click(screen.getByText('disconnect'));
    expect(firstDestroy).toHaveBeenCalledOnce();
  });
});
