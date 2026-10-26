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
import { findOperationById } from '../operations';
import type { IdentityUpdateKeysOptions } from '../forms/IdentityUpdateKeys';
import { wallet } from '@dashevo/evo-sdk';
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

vi.mock('../SignerStatusCard', () => ({
  SignerStatusCard: ({ onRetry }: { onRetry?: () => void }) => (
    <button type="button" onClick={onRetry}>
      Refresh signer keys
    </button>
  ),
}));

const useSdkMock = vi.mocked(useSdk);
const useSignerMock = vi.mocked(useSigner);
interface TestOptions {
  id: string;
  amount?: bigint;
  secret?: string;
  secretBytes?: Uint8Array;
  publicBytes?: Uint8Array;
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
    secrets: 'none',
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

  it('shows unsupported operations before collecting or reviewing inputs', () => {
    useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
    setup({ capability: { status: 'unsupported', reason: 'Use the supported external tool.' } });
    expect(screen.getByText('Use the supported external tool.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByText('form ready')).not.toBeInTheDocument();
  });

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

  it.each([null, createMockSigner({ prepareSdk: undefined })])(
    'runs form-signed operations without a usable connected signer (%#)',
    async (signer) => {
      useSignerMock.mockReturnValue({ ...useSignerMock(), signer });
      const { execute } = setup({
        capability: { status: 'available', signer: 'form', reason: 'Keys come from the form.' },
        feeNote: 'the paying address covers it.',
      });
      expect(screen.queryByText('No signer connected')).not.toBeInTheDocument();
      expect(screen.getByText('Keys come from the form.')).toBeInTheDocument();
      review();
      expect(screen.getByText(/Keys: entered in the form/)).toBeInTheDocument();
      expect(screen.getByText(/Fees: the paying address covers it\./)).toBeInTheDocument();
      expect(screen.queryByText(/Signing key:/)).not.toBeInTheDocument();
      broadcast();
      await screen.findByText('Broadcast succeeded');
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ signer: null, options: initialOptions }),
      );
      expect(screen.getByText('Signed with keys entered in the form')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Open identity' })).not.toBeInTheDocument();
    },
  );

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

  it.each([
    ['operation-1', false],
    ['give-up-control', true],
  ])('asks for the destructive acknowledgement only when %s is destructive', async (id, destructive) => {
    initialOptions = { id };
    const { execute } = setup({ destructive: (options) => options.id === 'give-up-control' });
    review();
    const ack = screen.queryByRole('checkbox', { name: 'I understand this is not reversible.' });
    expect(!!ack).toBe(destructive);
    expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toHaveProperty('disabled', destructive);
    if (ack) fireEvent.click(ack);
    await act(async () => broadcast());
    expect(execute).toHaveBeenCalledOnce();
  });

  it('treats a failing destructive check as destructive', () => {
    setup({
      destructive: () => {
        throw new Error('cannot tell');
      },
    });
    review();
    expect(screen.getByRole('checkbox', { name: 'I understand this is not reversible.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeDisabled();
  });

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

  describe('review details', () => {
    const transferKeys = [
      { id: 2, purpose: 'TRANSFER', securityLevel: 'CRITICAL' },
      {
        id: 7,
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        contractBounds: { contractId: 'C' },
      },
    ];
    beforeEach(() => {
      useSignerMock.mockReturnValue({
        ...useSignerMock(),
        signer: createMockSigner({ availableKeys: vi.fn().mockResolvedValue(transferKeys) }),
      });
    });

    it('shows the key that will sign and how fees are charged', async () => {
      const signingCriteria = vi.fn().mockResolvedValue({ purpose: 'TRANSFER' });
      setup({ capability: { status: 'available' }, signingCriteria });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      expect(await screen.findByText('Signing key: #2 · TRANSFER · CRITICAL')).toBeInTheDocument();
      expect(signingCriteria).toHaveBeenCalledWith(useSdkMock().sdk, initialOptions);
      expect(screen.getByText(/does not provide an estimate in advance/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeEnabled();
    });

    it('binds signing to the reviewed key', async () => {
      const { execute } = setup({
        capability: { status: 'available' },
        signingCriteria: vi.fn().mockResolvedValue({ purpose: 'TRANSFER' }),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      await screen.findByText('Signing key: #2 · TRANSFER · CRITICAL');
      broadcast();
      await screen.findByText('Broadcast succeeded');
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ signingKeyId: 2 }));
    });

    it('requires confirming a signing key that changes during review', async () => {
      const availableKeys = vi.fn().mockResolvedValue(transferKeys);
      useSignerMock.mockReturnValue({
        ...useSignerMock(),
        signer: createMockSigner({ availableKeys }),
      });
      const { execute } = setup({
        capability: { status: 'available' },
        signingCriteria: vi.fn().mockResolvedValue({ purpose: 'TRANSFER' }),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      await screen.findByText('Signing key: #2 · TRANSFER · CRITICAL');

      // Key #2 was disabled on Platform; the refreshed list selects #3 instead.
      availableKeys.mockResolvedValue([{ id: 3, purpose: 'TRANSFER', securityLevel: 'CRITICAL' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh signer keys' }));
      await screen.findByText('Signing key: #3 · TRANSFER · CRITICAL');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The signing key changed while you were reviewing. It was #2 · TRANSFER · CRITICAL.',
      );
      expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Use key #3' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      broadcast();
      await screen.findByText('Broadcast succeeded');
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ signingKeyId: 3 }));
    });

    it('does not ask again when a refresh selects the same key', async () => {
      setup({
        capability: { status: 'available' },
        signingCriteria: vi.fn().mockResolvedValue({ purpose: 'TRANSFER' }),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      await screen.findByText('Signing key: #2 · TRANSFER · CRITICAL');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh signer keys' }));
      await screen.findByText('Signing key: #2 · TRANSFER · CRITICAL');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeEnabled(),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('names contract bounds and blocks signing when no key qualifies', async () => {
      setup({
        capability: { status: 'available' },
        signingCriteria: vi.fn().mockResolvedValue({ purpose: 'OWNER' }),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      expect(await screen.findByText(/No key can sign this operation/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign + broadcast' })).toBeDisabled();
    });

    it('describes contract-bound signing keys', async () => {
      setup({
        capability: { status: 'available' },
        signingCriteria: vi
          .fn()
          .mockResolvedValue({ purpose: 'AUTHENTICATION', target: { contractId: 'C' } }),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      expect(
        await screen.findByText('Signing key: #7 · AUTHENTICATION · HIGH · bound to contract C'),
      ).toBeInTheDocument();
    });

    it('shows review data instead of raw options when the descriptor redacts them', () => {
      initialOptions = { id: 'secret-value' };
      setup({ secrets: { reviewData: () => ({ id: 'hidden' }) } });
      review();
      expect(screen.queryByText(/"secret-value"/)).not.toBeInTheDocument();
      expect(screen.getByText(/"hidden"/)).toBeInTheDocument();
    });
  });

  describe('private keys in the inputs', () => {
    const WIF = 'cVt4o7BGAig1UXywgGSmARhxMdzP5qvQsxKkSsc1XEkw3tDTQFpy';
    const secrets = {
      reviewData: ({ secret: _secret, secretBytes: _bytes, ...rest }: TestOptions) => rest,
      secretBytes: (options: TestOptions) => (options.secretBytes ? [options.secretBytes] : []),
    };
    beforeEach(() => {
      initialOptions = {
        id: 'add-key',
        secret: WIF,
        secretBytes: new Uint8Array([7, 7, 7]),
        publicBytes: new Uint8Array([1, 2, 3]),
      };
    });

    /**
     * Paths in the mounted tree's hook state, refs, props and effect deps that
     * hold the secret, in both the current and the alternate (previous) fibers.
     */
    function secretsHeldByReact(container: HTMLElement, secret = WIF): string[] {
      const rootKey = Object.keys(container).find((key) => key.startsWith('__reactContainer$'))!;
      type Fiber = Record<string, unknown> & {
        child?: Fiber;
        sibling?: Fiber;
        alternate?: Fiber | null;
        elementType?: unknown;
      };
      const rootFiber = (container as unknown as Record<string, { stateNode: { current: Fiber } }>)[
        rootKey
      ]!.stateNode.current;
      const found: string[] = [];
      const seen = new Set<object>();
      const search = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          if (value.includes(secret)) found.push(path);
          return;
        }
        if (!value || typeof value !== 'object' || seen.has(value) || value instanceof Node) return;
        seen.add(value);
        if (value instanceof Uint8Array) {
          if (value.some((byte) => byte === 7)) found.push(`${path} (bytes)`);
          return;
        }
        // Do not follow links into other fibers; the walk below visits each one.
        if ('stateNode' in value && 'return' in value) return;
        for (const [key, item] of Object.entries(value))
          if (key !== '_owner') search(item, `${path}.${key}`);
      };
      const visit = (fiber: Fiber | undefined, depth: number): void => {
        for (let node = fiber; node; node = node.sibling) {
          const name =
            typeof node.elementType === 'function'
              ? node.elementType.name
              : String(node.elementType);
          for (const [label, copy] of [
            ['', node],
            ['(alternate) ', node.alternate],
          ] as const) {
            if (!copy) continue;
            search(copy.memoizedState, `${label}${name}.state`);
            search(copy.memoizedProps, `${label}${name}.props`);
            search(copy.updateQueue, `${label}${name}.effects`);
          }
          visit(node.child, depth + 1);
        }
      };
      visit(rootFiber, 0);
      return found;
    }

    it.each([
      ['success', () => Promise.resolve({ ok: true }), 'Broadcast succeeded'],
      [
        'not submitted',
        () => Promise.reject(new OperationNotSubmittedError('No eligible key')),
        'Not submitted.',
      ],
      [
        'outcome unknown',
        () => Promise.reject(new BroadcastOutcomeUnknownError(new Error('timeout'))),
        'Outcome unknown.',
      ],
    ])('keeps no inputs in React state or the DOM once execution settles (%s)', async (_, outcome, settled) => {
      const execute = vi.fn((args: { options: TestOptions }) => {
        expect(args.options.secret).toBe(WIF);
        return outcome();
      });
      const { container, descriptor, rerender } = setup({ execute, secrets });
      const original = initialOptions.secretBytes!;
      review();
      // The walk does see the secret while the inputs are still needed.
      expect(secretsHeldByReact(container)).not.toEqual([]);
      broadcast();
      await screen.findByText(settled);

      expect(execute).toHaveBeenCalledOnce();
      expect(secretsHeldByReact(container)).toEqual([]);
      expect(Array.from(original)).toEqual([0, 0, 0]);
      // Only declared secret bytes are wiped.
      expect(Array.from(initialOptions.publicBytes!)).toEqual([1, 2, 3]);
      expect(container.innerHTML).not.toContain(WIF);

      // Clearing the signer afterwards leaves the receipt and nothing secret.
      useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
      rerender(<OperationShell descriptor={descriptor} />);
      expect(screen.getByText(settled)).toBeInTheDocument();
      expect(secretsHeldByReact(container)).toEqual([]);
    });

    it('drops secrets when the signer is cleared during review', async () => {
      const { container, descriptor, rerender } = setup({
        secrets,
        capability: { status: 'available' },
        signingCriteria: vi.fn().mockResolvedValue({}),
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
      review();
      await screen.findByText(/Signing key: #0/);
      useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
      rerender(<OperationShell descriptor={descriptor} />);
      expect(screen.getByText('No signer connected')).toBeInTheDocument();
      expect(secretsHeldByReact(container)).toEqual([]);
    });

    it('drops secrets from shell state when the signer is cleared mid-flight', async () => {
      let finish!: (value: unknown) => void;
      const execute = vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { container, descriptor, rerender } = setup({ execute, secrets });
      review();
      broadcast();
      expect(execute).toHaveBeenCalledOnce();
      expect(secretsHeldByReact(container)).not.toEqual([]);

      useSignerMock.mockReturnValue({ ...useSignerMock(), signer: null });
      rerender(<OperationShell descriptor={descriptor} />);
      expect(secretsHeldByReact(container)).toEqual([]);
      expect(screen.getByText(/Signing via your connected signer/)).toBeInTheDocument();

      await act(async () => finish({ ok: true }));
      expect(secretsHeldByReact(container)).toEqual([]);
      expect(Array.from(initialOptions.secretBytes!)).toEqual([0, 0, 0]);
    });

    it.each([
      [
        'success',
        () => Promise.resolve({ kind: 'identity', identityId: 'identity-1', message: 'ok' }),
      ],
      [
        'outcome unknown',
        () => Promise.reject(new BroadcastOutcomeUnknownError(new Error('timeout'))),
      ],
    ])(
      'carries a new key from the real identity-key form to settle without keeping it (%s)',
      async (_, outcome) => {
        const pair = await wallet.keyPairFromHex('0'.repeat(63) + '5', 'testnet');
        const newKeyWif = pair.privateKeyWif;
        pair.free();
        useSignerMock.mockReturnValue({
          ...useSignerMock(),
          signer: createMockSigner({
            availableKeys: vi
              .fn()
              .mockResolvedValue([{ id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER' }]),
          }),
        });
        const execute = vi.fn(
          (args: { options: IdentityUpdateKeysOptions; signingKeyId?: number }) => {
            expect(args.options.addKeys?.[0]?.privateKeyWif).toBe(newKeyWif);
            expect(args.signingKeyId).toBe(0);
            return outcome();
          },
        );
        const descriptor = {
          ...findOperationById('identity.updateKeys')!.descriptor,
          execute,
        } as OperationDescriptor<unknown, unknown>;
        const { container } = renderWithProviders(<OperationShell descriptor={descriptor} />, {
          queryClient: createTestQueryClient(),
        });

        fireEvent.click(screen.getByRole('button', { name: 'Add a key' }));
        fireEvent.change(screen.getByLabelText('New key 1 private key (WIF)'), {
          target: { value: newKeyWif },
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
        review();
        expect(await screen.findByText(/Signing key: #0/)).toBeInTheDocument();
        // The review shows the key's metadata only; the hidden Build form, kept
        // for Back, is the one place that still holds it.
        expect(screen.getByText(/provided \(hidden\)/)).not.toHaveTextContent(newKeyWif);
        expect(secretsHeldByReact(container, newKeyWif)).not.toEqual([]);
        fireEvent.click(
          screen.getByRole('checkbox', { name: 'I understand this is not reversible.' }),
        );
        broadcast();

        await screen.findByText(/Broadcast succeeded|Outcome unknown\./);
        expect(execute).toHaveBeenCalledOnce();
        expect(secretsHeldByReact(container, newKeyWif)).toEqual([]);
        expect(container.innerHTML).not.toContain(newKeyWif);
      },
    );

    it.each([
      [
        'throws',
        () => {
          throw new Error(`cannot redact ${WIF}`);
        },
      ],
      ['returns something the shell cannot copy', () => ({ redact: () => WIF })],
    ])('refuses to review when the review view %s', (_, reviewData) => {
      setup({ secrets: { reviewData } });
      review();
      expect(screen.getByText(/Could not prepare the review/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign + broadcast' })).not.toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain(WIF);
    });

    it('keeps the outcome-unknown warning and receipt when wiping secret bytes throws', async () => {
      const execute = vi.fn(() =>
        Promise.reject(new BroadcastOutcomeUnknownError(new Error('timeout'))),
      );
      const { container } = setup({
        execute,
        secrets: {
          reviewData: secrets.reviewData,
          secretBytes: () => {
            throw new Error('not cloneable');
          },
        },
      });
      review();
      broadcast();
      expect(await screen.findByText('Outcome unknown.')).toBeInTheDocument();
      expect(screen.getByText(/This operation may have reached Platform/)).toBeInTheDocument();
      expect(screen.getByText(/Started:/)).toBeInTheDocument();
      expect(secretsHeldByReact(container)).toEqual([]);
    });
  });

  it.each([
    [{ stateTransitionHash: 'ab'.repeat(32) }, true],
    [{ ok: true }, false],
  ])('links the state transition when the result has its hash (%o)', async (result, linked) => {
    const { execute } = setup();
    execute.mockResolvedValue(result);
    review();
    broadcast();
    await screen.findByText('Broadcast succeeded');
    if (linked)
      expect(screen.getByRole('link', { name: 'Open state transition' })).toHaveAttribute(
        'href',
        `/state-transition/?hash=${'ab'.repeat(32)}&network=testnet`,
      );
    else expect(screen.getByText(/does not return the state-transition hash/)).toBeInTheDocument();
  });
});
