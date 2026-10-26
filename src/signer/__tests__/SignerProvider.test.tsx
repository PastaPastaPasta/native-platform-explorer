import React, { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { useSdk } from '@sdk/hooks';
import { installStorageMock } from '@/test/storage';
import { createMockSigner } from '@/test/signer';
import { createSdkContextValue } from '@/test/sdk';
import { isWriteRoute, SignerProvider, useSigner } from '../SignerProvider';

vi.mock('@sdk/hooks', () => ({
  useSdk: vi.fn(),
}));
const route = vi.hoisted(() => ({ pathname: '/wallet/' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

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
    route.pathname = '/wallet/';
    firstDestroy = vi.fn();
    secondDestroy = vi.fn();
    installStorageMock('sessionStorage');
    useSdkMock.mockReturnValue(createSdkContextValue({ sdk: null, status: 'connecting' }));
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
      JSON.stringify({ kind: 'wif', identityId: 'identity-a', network: 'testnet' }),
    );
  });

  it('hydrates a previous-session stash without restoring private signer material', async () => {
    installStorageMock('sessionStorage', {
      'npe:signer-kind': JSON.stringify({ kind: 'mnemonic', identityId: 'identity-b', network: 'testnet' }),
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

  it('hides a reconnect hint from another network or without one', async () => {
    for (const stash of [
      { kind: 'mnemonic', identityId: 'identity-b', network: 'mainnet' },
      { kind: 'mnemonic', identityId: 'identity-b' },
    ]) {
      installStorageMock('sessionStorage', { 'npe:signer-kind': JSON.stringify(stash) });
      const view = render(
        <SignerProvider>
          <Harness />
        </SignerProvider>,
      );
      await act(async () => {});
      expect(screen.getByTestId('stash')).toHaveTextContent('none');
      view.unmount();
    }
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

  it('clears after ten minutes without input, even while the tab stays visible', () => {
    vi.useFakeTimers();
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    act(() => vi.advanceTimersByTime(9 * 60_000));
    fireEvent.keyDown(document.body, { key: 'a' });
    act(() => vi.advanceTimersByTime(9 * 60_000));
    expect(firstDestroy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
    // An automatic clear keeps the public reconnect hint.
    expect(screen.getByTestId('stash')).toHaveTextContent('wif:identity-a');
  });

  it('counts hidden time as idle and rechecks when the tab becomes visible', () => {
    vi.useFakeTimers();
    render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    // Simulate a throttled background timer: the clock moves, the timer has not fired.
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(firstDestroy).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(firstDestroy).toHaveBeenCalledOnce();
  });

  it('clears the signer when leaving the wallet and broadcast pages', () => {
    const view = render(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    fireEvent.click(screen.getByText('connect first'));
    route.pathname = '/broadcast/';
    view.rerender(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(firstDestroy).not.toHaveBeenCalled();
    route.pathname = '/identity/';
    view.rerender(
      <SignerProvider>
        <Harness />
      </SignerProvider>,
    );
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(screen.getByTestId('signer')).toHaveTextContent('none');
    expect(screen.getByTestId('stash')).toHaveTextContent('wif:identity-a');
  });

  it.each([
    ['/wallet', true],
    ['/wallet/', true],
    ['/broadcast/', true],
    ['/broadcasting/', false],
    ['/', false],
    ['/identity/', false],
  ])('treats %s as a write route: %s', (pathname, expected) => {
    expect(isWriteRoute(pathname)).toBe(expected);
  });

  it('hydrates backup stashes and wipes live secrets on unload', () => {
    installStorageMock('sessionStorage', {
      'npe:signer-kind': JSON.stringify({ kind: 'backup', identityId: 'identity-a', network: 'testnet' }),
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
      'npe:signer-kind': JSON.stringify({ kind: 'backup', identityId: 'identity-a', network: 'testnet' }),
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
      const value = useSigner();
      useEffect(() => { current = value; }, [value]);
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

  it('rejects a completed key import immediately when its SDK session aborts', () => {
    const controller = new AbortController();
    const context = {
      ...useSdkMock(),
      sdk: {} as EvoSDK,
      status: 'ready' as const,
      sessionSignal: controller.signal,
    };
    useSdkMock.mockReturnValue(context);
    let completeImport!: ReturnType<typeof useSigner>['connect'];
    function Capture() {
      const { connect } = useSigner();
      useEffect(() => { completeImport = connect; }, [connect]);
      return null;
    }
    render(
      <SignerProvider>
        <Capture />
      </SignerProvider>,
    );

    // SDK retirement aborts synchronously, before its new React state commits.
    controller.abort();
    expect(() =>
      completeImport(createMockSigner({ sdk: context.sdk, destroy: firstDestroy })),
    ).toThrow(/session changed/);
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem('npe:signer-kind')).toBeNull();
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
