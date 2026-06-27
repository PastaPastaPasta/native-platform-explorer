import React, { useEffect } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { createMockSigner } from '@/test/signer';
import { OperationShell, type OperationDescriptor, type OperationFormProps } from '../OperationShell';
import type * as SdkHooksModule from '@sdk/hooks';
import type * as SignerProviderModule from '@/signer/SignerProvider';

vi.mock('@sdk/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof SdkHooksModule>();
  return {
    ...actual,
    useSdk: vi.fn(),
  };
});

vi.mock('@/signer/SignerProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof SignerProviderModule>();
  return {
    ...actual,
    useSigner: vi.fn(),
  };
});

const useSdkMock = vi.mocked(useSdk);
const useSignerMock = vi.mocked(useSigner);

interface TestOptions {
  id: string;
}

function TestForm({ onOptionsChange }: OperationFormProps<TestOptions>) {
  useEffect(() => {
    onOptionsChange({ id: 'operation-1' });
  }, [onOptionsChange]);

  return <div>form ready</div>;
}

describe('OperationShell', () => {
  it('executes a valid operation through the review and broadcast flow', async () => {
    const sdk = createMockSdk();
    const signer = createMockSigner();
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const descriptor: OperationDescriptor<TestOptions, { ok: boolean }> = {
      title: 'Test operation',
      description: 'Exercises the shell.',
      FormComponent: TestForm,
      summarise: (options) => `Will run ${options.id}`,
      execute,
    };

    useSdkMock.mockReturnValue({
      sdk,
      status: 'ready',
      network: 'testnet',
      trusted: true,
      error: null,
      setNetwork: vi.fn(),
      setTrusted: vi.fn(),
      reconnect: vi.fn(),
    });
    useSignerMock.mockReturnValue({
      signer,
      stash: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearStash: vi.fn(),
    });

    renderWithProviders(<OperationShell descriptor={descriptor} />);

    expect(await screen.findByText('form ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('Will run operation-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign + broadcast' }));

    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith({
        sdk,
        signer,
        options: { id: 'operation-1' },
      });
    });
    expect(await screen.findByText('Broadcast succeeded')).toBeInTheDocument();
  });

  it('blocks execution when no signer is connected', () => {
    useSdkMock.mockReturnValue({
      sdk: createMockSdk(),
      status: 'ready',
      network: 'testnet',
      trusted: true,
      error: null,
      setNetwork: vi.fn(),
      setTrusted: vi.fn(),
      reconnect: vi.fn(),
    });
    useSignerMock.mockReturnValue({
      signer: null,
      stash: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearStash: vi.fn(),
    });

    renderWithProviders(
      <OperationShell
        descriptor={{
          title: 'No-op',
          description: 'No-op',
          FormComponent: TestForm,
          summarise: () => 'No-op',
          execute: vi.fn(),
        }}
      />,
    );

    expect(screen.getByText('No signer connected')).toBeInTheDocument();
    expect(screen.queryByText('form ready')).not.toBeInTheDocument();
  });
});
