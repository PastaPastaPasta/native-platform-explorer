import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  const second = createMockSigner({ identityId: 'identity-b', kind: 'mnemonic', destroy: secondDestroy });

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
      sdk: null,
      status: 'connecting',
      network: 'testnet',
      trusted: true,
      error: null,
      setNetwork: vi.fn(),
      setTrusted: vi.fn(),
      reconnect: vi.fn(),
    });
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
});
