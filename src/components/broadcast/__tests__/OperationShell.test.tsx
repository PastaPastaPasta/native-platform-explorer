import React, { useEffect } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { createMockSigner } from '@/test/signer';
import {
  OperationShell,
  type OperationDescriptor,
  type OperationFormProps,
} from '../OperationShell';
import { BroadcastOutcomeUnknownError, OperationNotSubmittedError } from '../outcomes';
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

vi.mock('../SignerStatusCard', () => ({ SignerStatusCard: () => null }));

const useSdkMock = vi.mocked(useSdk);
const useSignerMock = vi.mocked(useSigner);
interface TestOptions {
  id: string;
  amount?: bigint;
}
let changeOptions: OperationFormProps<TestOptions>['onOptionsChange'];
let initialOptions: TestOptions;
function TestForm({ onOptionsChange }: OperationFormProps<TestOptions>) {
  useEffect(() => {
    changeOptions = onOptionsChange;
    onOptionsChange(initialOptions);
  }, [onOptionsChange]);
  return <div>form ready</div>;
}
function setup(overrides: Partial<OperationDescriptor<TestOptions, unknown>> = {}) {
  const execute = vi.fn().mockResolvedValue({ ok: true });
  const descriptor: OperationDescriptor<TestOptions, unknown> = {
    operationId: 'test.operation',
    title: 'Test operation',
    description: 'Exercises the shell.',
    FormComponent: TestForm,
    summarise: (options) => `Will run ${options.id}`,
    execute,
    ...overrides,
  };
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const rendered = renderWithProviders(<OperationShell descriptor={descriptor} />, { queryClient });
  return { execute, descriptor, invalidate, ...rendered };
}
function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
}
function broadcast() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign + broadcast' }));
}

beforeEach(() => {
  initialOptions = { id: 'operation-1' };
  useSdkMock.mockReturnValue(createSdkContextValue());
  useSignerMock.mockReturnValue({
    signer: createMockSigner(),
    stash: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearStash: vi.fn(),
  });
});

describe('OperationShell', () => {
  it('checks matching signer keys before allowing review', async () => {
    let resolveKeys!: (keys: unknown[]) => void;
    useSignerMock.mockReturnValue({
      ...useSignerMock(),
      signer: createMockSigner({
        availableKeys: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveKeys = resolve;
            }),
        ),
      }),
    });
    setup({ capability: { status: 'available', criteria: { purpose: 'TRANSFER' } } });
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    await act(async () => resolveKeys([{ id: 1, purpose: 'TRANSFER' }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
  });

  it.each([
    createMockSigner({
      availableKeys: vi.fn().mockResolvedValue([{ id: 1, purpose: 'AUTHENTICATION' }]),
    }),
    createMockSigner({ prepareSdk: undefined }),
    createMockSigner({
      availableKeys: vi.fn().mockRejectedValue(new Error('Identity lookup unavailable')),
    }),
  ])('blocks review for incompatible or unavailable signer keys', async (signer) => {
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer });
    setup({ capability: { status: 'available', criteria: { purpose: 'TRANSFER' } } });
    await waitFor(() =>
      expect(screen.queryByText('Checking signer capabilities…')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });

  it.each(['unsupported', 'external-bridge'] as const)(
    'shows %s before collecting or reviewing inputs',
    (status) => {
      useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
      setup({ capability: { status, reason: 'Use the supported external tool.' } });
      expect(screen.getByText('Use the supported external tool.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
      expect(screen.queryByText('form ready')).not.toBeInTheDocument();
    },
  );

  it('blocks a signer bound to another SDK session', async () => {
    useSignerMock.mockReturnValue({
      ...useSignerMock(),
      signer: createMockSigner({ sdk: createMockSdk() }),
    });
    setup({ capability: { status: 'available' } });
    expect(
      await screen.findByText('Reconnect your signer for the current SDK session.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });

  it('opens the top-up bridge form without requiring a signer or offering broadcast', () => {
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
    setup({ operationId: 'identity.topUp', capability: { status: 'external-bridge' } });
    expect(screen.getByRole('textbox', { name: 'Identity' })).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign + broadcast' })).not.toBeInTheDocument();
  });

  it('clears an external top-up identity when the network and signer change', () => {
    const { descriptor, rerender } = setup({
      operationId: 'identity.topUp',
      capability: { status: 'external-bridge' },
    });
    const identity = screen.getByRole('textbox', { name: 'Identity' });
    fireEvent.change(identity, { target: { value: 'A'.repeat(43) } });
    useSdkMock.mockReturnValue({ ...useSdkMock(), network: 'mainnet', sdk: createMockSdk() });
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
    rerender(<OperationShell descriptor={descriptor} />);
    expect(screen.getByRole('textbox', { name: 'Identity' })).toHaveValue('');
  });

  it('executes the exact reviewed snapshot and refreshes its network', async () => {
    initialOptions = { id: 'operation-1', amount: 9007199254740993n };
    const { execute, invalidate } = setup();
    review();
    expect(screen.getByText('Will run operation-1')).toBeInTheDocument();
    broadcast();
    await screen.findByText('Broadcast succeeded');
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      sdk: useSdkMock().sdk,
      signer: useSignerMock().signer,
      options: initialOptions,
      assertCurrent: expect.any(Function),
    });
    expect(execute.mock.calls[0]?.[0].options).not.toBe(initialOptions);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['npe', 'testnet'] });
    expect(screen.getByRole('link', { name: 'Open identity' })).toHaveAttribute(
      'href',
      '/identity/?id=identity-1&network=testnet',
    );
  });

  it.each(['network', 'trusted', 'sdk', 'status', 'signer', 'identity', 'operation'] as const)(
    'invalidates approval when %s changes',
    (change) => {
      const { execute, descriptor, rerender } = setup({ destructive: true });
      review();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'I understand this is not reversible.' }),
      );
      expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeEnabled();
      const ctx = useSdkMock();
      const signerCtx = useSignerMock();
      if (change === 'network') useSdkMock.mockReturnValue({ ...ctx, network: 'mainnet' });
      if (change === 'trusted') useSdkMock.mockReturnValue({ ...ctx, trusted: !ctx.trusted });
      if (change === 'sdk') useSdkMock.mockReturnValue({ ...ctx, sdk: createMockSdk() });
      if (change === 'status') useSdkMock.mockReturnValue({ ...ctx, status: 'connecting' });
      if (change === 'signer')
        useSignerMock.mockReturnValue({ ...signerCtx, signer: createMockSigner() });
      if (change === 'identity')
        Object.defineProperty(signerCtx.signer, 'identityId', {
          value: 'identity-2',
          configurable: true,
        });
      rerender(
        <OperationShell
          descriptor={
            change === 'operation'
              ? { ...descriptor, operationId: 'another.operation' }
              : descriptor
          }
        />,
      );
      expect(screen.queryByRole('button', { name: 'Sign + broadcast' })).not.toBeInTheDocument();
      expect(screen.getByText(/Transaction context changed/)).toBeInTheDocument();
      expect(execute).not.toHaveBeenCalled();
      if (change !== 'status') {
        review();
        expect(
          screen.getByRole('checkbox', { name: 'I understand this is not reversible.' }),
        ).not.toBeChecked();
        expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeDisabled();
      }
    },
  );

  it('invalidates review for changed inputs including mutation of the original options', () => {
    const { descriptor, execute, rerender } = setup();
    review();
    initialOptions.id = 'operation-2';
    rerender(<OperationShell descriptor={descriptor} />);
    expect(screen.queryByText('Will run operation-1')).not.toBeInTheDocument();
    expect(screen.getByText(/Transaction context changed/)).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    review();
    act(() => changeOptions({ id: 'operation-3' }));
    expect(screen.queryByRole('button', { name: 'Sign + broadcast' })).not.toBeInTheDocument();
  });

  it('requires fresh mainnet confirmation after returning to the form', () => {
    useSdkMock.mockReturnValue({ ...useSdkMock(), network: 'mainnet' });
    setup();
    review();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'I understand this will execute on mainnet.' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Mainnet confirmation' }), {
      target: { value: 'MAINNET' },
    });
    expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    review();
    expect(
      screen.getByRole('checkbox', { name: 'I understand this will execute on mainnet.' }),
    ).not.toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Mainnet confirmation' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeDisabled();
  });

  it('does not allow review before the SDK is ready', () => {
    useSdkMock.mockReturnValue({ ...useSdkMock(), status: 'connecting' });
    setup();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });

  it('invalidates review when the SDK session token changes with the same SDK', () => {
    const context = { ...useSdkMock(), sessionId: 1, sessionSignal: new AbortController().signal };
    useSdkMock.mockReturnValue(context);
    const { descriptor, rerender } = setup();
    review();
    const reconnected = { ...context, sessionId: 2 };
    useSdkMock.mockReturnValue(reconnected);
    rerender(<OperationShell descriptor={descriptor} />);
    expect(screen.queryByRole('button', { name: 'Sign + broadcast' })).not.toBeInTheDocument();
  });

  it('checks a synchronously aborted SDK session before submission even without rerender', async () => {
    const controller = new AbortController();
    const context = { ...useSdkMock(), sessionId: 1, sessionSignal: controller.signal };
    useSdkMock.mockReturnValue(context);
    let resume!: () => void;
    const execute = vi.fn().mockImplementation(async ({ assertCurrent }) => {
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      assertCurrent();
    });
    setup({ execute });
    review();
    broadcast();
    controller.abort();
    await act(async () => resume());
    expect(await screen.findByRole('heading', { name: 'Not submitted' })).toBeInTheDocument();
  });

  it('prevents a prepared transaction from submitting after the shell unmounts', async () => {
    let resume!: () => void;
    const submit = vi.fn();
    const execute = vi.fn().mockImplementation(async ({ assertCurrent }) => {
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      assertCurrent();
      submit();
    });
    const { unmount } = setup({ execute });
    review();
    broadcast();
    unmount();
    await act(async () => resume());
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks execution when no signer is connected', () => {
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
    setup();
    expect(screen.getByText('No signer connected')).toBeInTheDocument();
    expect(screen.queryByText('form ready')).not.toBeInTheDocument();
  });

  it('keeps an in-flight receipt scoped to its origin and prevents duplicate execution', async () => {
    let resolve!: (value: unknown) => void;
    const execute = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { descriptor, rerender, invalidate } = setup({ execute });
    review();
    const button = screen.getByRole('button', { name: 'Sign + broadcast' });
    fireEvent.click(button);
    fireEvent.click(button);
    useSdkMock.mockReturnValue({ ...useSdkMock(), network: 'mainnet', sdk: createMockSdk() });
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
    rerender(<OperationShell descriptor={{ ...descriptor, title: 'Another operation' }} />);
    await act(async () =>
      resolve({
        kind: 'document',
        contractId: 'contract-1',
        documentType: 'note',
        documentId: 'document-1',
      }),
    );
    await screen.findByText('Broadcast succeeded');
    expect(execute).toHaveBeenCalledOnce();
    expect(screen.getByText('Network: testnet · trusted quorum source')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['npe', 'testnet'] });
    expect(screen.getByRole('link', { name: 'Open document' })).toHaveAttribute(
      'href',
      '/contract/document/?id=contract-1&type=note&docId=document-1&network=testnet',
    );
  });

  it('aborts before a delayed submission when approved context changed', async () => {
    let resume!: () => void;
    const execute = vi.fn().mockImplementation(async ({ assertCurrent }) => {
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      assertCurrent();
    });
    const { descriptor, rerender } = setup({ execute });
    review();
    broadcast();
    useSdkMock.mockReturnValue({ ...useSdkMock(), trusted: false });
    rerender(<OperationShell descriptor={descriptor} />);
    await act(async () => resume());
    expect(await screen.findByRole('heading', { name: 'Not submitted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to build and review' })).toBeInTheDocument();
  });

  it.each([
    new Error('Transport timeout'),
    new BroadcastOutcomeUnknownError(new Error('Transport timeout'), {
      documentId: 'doc-1',
      contractId: 'contract-1',
      documentType: 'note',
    }),
  ])('does not retry an unknown broadcast outcome', async (error) => {
    const execute = vi.fn().mockRejectedValue(error);
    const { invalidate } = setup({ execute });
    review();
    broadcast();
    expect(await screen.findByRole('heading', { name: 'Outcome unknown' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Return to build and review' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(execute).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['npe', 'testnet'] });
  });

  it('allows a fresh review after a definitive local rejection', async () => {
    const execute = vi.fn().mockRejectedValue(new OperationNotSubmittedError('No eligible key'));
    setup({ execute });
    review();
    broadcast();
    await screen.findByRole('heading', { name: 'Not submitted' });
    fireEvent.click(screen.getByRole('button', { name: 'Return to build and review' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps receipt links within a configured static base path', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/native-platform-explorer');
    try {
      setup();
      review();
      broadcast();
      await screen.findByText('Broadcast succeeded');
      expect(screen.getByRole('link', { name: 'Open identity' })).toHaveAttribute(
        'href',
        '/native-platform-explorer/identity/?id=identity-1&network=testnet',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
