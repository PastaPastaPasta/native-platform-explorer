import { useEffect } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import { renderWithProviders } from '@/test/render';
import { createSdkContextValue } from '@/test/sdk';
import { createMockSigner } from '@/test/signer';
import { OperationShell, type OperationFormProps } from '../OperationShell';
import type * as SdkHooksModule from '@sdk/hooks';
import type * as SignerProviderModule from '@/signer/SignerProvider';

vi.mock('@sdk/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof SdkHooksModule>()),
  useSdk: vi.fn(),
}));
vi.mock('@/signer/SignerProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof SignerProviderModule>()),
  useSigner: vi.fn(),
}));

function TestForm({ onOptionsChange }: OperationFormProps<{ id: string }>) {
  useEffect(() => onOptionsChange({ id: 'operation-1' }), [onOptionsChange]);
  return <div>form ready</div>;
}

beforeEach(() => {
  vi.mocked(useSdk).mockReturnValue(createSdkContextValue());
});

function setup(availableKeys: ReturnType<typeof vi.fn>) {
  const execute = vi.fn();
  vi.mocked(useSigner).mockReturnValue({
    signer: createMockSigner({ availableKeys }),
    stash: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearStash: vi.fn(),
  });
  renderWithProviders(
    <OperationShell
      descriptor={{
        operationId: 'identity.creditTransfer',
        title: 'Transfer credits',
        description: 'Exercises capability recovery without submitting a transaction.',
        FormComponent: TestForm,
        summarise: ({ id }) => id,
        execute,
        capability: { status: 'available', criteria: { purpose: 'TRANSFER' } },
      }}
    />,
  );
  return execute;
}

const keys = [{ id: 1, purpose: 'TRANSFER', securityLevel: 'CRITICAL' }];

describe('signer capability recovery', () => {
  it('recovers the shell and signer card together after the visible key-check retry', async () => {
    const availableKeys = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary network outage'))
      .mockRejectedValueOnce(new Error('Temporary network outage'))
      .mockResolvedValue(keys);
    const execute = setup(availableKeys);
    await screen.findByText('Could not validate signer keys: Temporary network outage');
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry key check' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
    expect(screen.queryByText(/Could not validate signer keys:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry key check' })).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });

  it('provides recovery when only the shell capability check fails', async () => {
    const availableKeys = vi
      .fn()
      .mockResolvedValueOnce(keys)
      .mockRejectedValueOnce(new Error('Capability lookup unavailable'))
      .mockResolvedValue(keys);
    const execute = setup(availableKeys);
    await screen.findByText('Could not validate signer keys: Capability lookup unavailable');
    expect(screen.queryByRole('button', { name: 'Retry key check' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry signer capabilities' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: 'Retry signer capabilities' }),
    ).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });
});
