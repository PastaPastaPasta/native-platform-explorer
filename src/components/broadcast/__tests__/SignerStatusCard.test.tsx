import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSigner } from '@/signer/SignerProvider';
import { createMockSigner } from '@/test/signer';
import { SignerStatusCard } from '../SignerStatusCard';

vi.mock('@/signer/SignerProvider', () => ({ useSigner: vi.fn() }));
vi.mock('@components/data/IdentityLink', () => ({
  IdentityLink: ({ id }: { id: string }) => <span>{id}</span>,
}));
vi.mock('@components/data/CodeBlock', () => ({
  CodeBlock: ({ value }: { value: unknown }) => <pre>{JSON.stringify(value)}</pre>,
}));
const useSignerMock = vi.mocked(useSigner);

beforeEach(() => vi.clearAllMocks());

function context(signer: ReturnType<typeof createMockSigner> | null) {
  useSignerMock.mockReturnValue({
    signer,
    stash: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearStash: vi.fn(),
  });
}

describe('SignerStatusCard', () => {
  it('shows failed live key checks and lets the user retry without broadcasting', async () => {
    const availableKeys = vi
      .fn()
      .mockRejectedValueOnce(Object.create({ get message() { return 'Network unavailable'; } }))
      .mockResolvedValueOnce([{ id: 4, purpose: 'AUTHENTICATION' }]);
    context(createMockSigner({ availableKeys }));
    render(<SignerStatusCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry key check' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText(/"id":4/)).toBeInTheDocument();
    expect(availableKeys).toHaveBeenCalledTimes(2);
  });

  it('ignores a pending key lookup after disconnect', async () => {
    let reject!: (error: Error) => void;
    context(
      createMockSigner({
        availableKeys: () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      }),
    );
    const view = render(<SignerStatusCard />);
    context(null);
    view.rerender(<SignerStatusCard />);
    reject(new Error('Signer disconnected'));
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Signer')).toBeNull();
  });
});
