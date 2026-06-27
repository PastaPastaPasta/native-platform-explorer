import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQueryProofStore } from '@contexts/QueryProofStore';
import { useTotalCreditsInPlatform } from '../queries';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';

function TotalCreditsProbe() {
  const query = useTotalCreditsInPlatform();
  const store = useQueryProofStore();
  const firstEntry = store.entries[0];
  return (
    <>
      <div data-testid="query-state">
        {query.status}:{String(query.data ?? '')}:{query.proofState.kind}
      </div>
      <div data-testid="proof-entry">
        {store.entries.length}:{firstEntry?.status ?? ''}:{firstEntry?.error ?? ''}
      </div>
    </>
  );
}

describe('SDK query proof flow', () => {
  it('records proof-capture errors while falling back to the non-proof SDK method', async () => {
    const totalCreditsInPlatform = vi.fn().mockResolvedValue(42);
    const totalCreditsInPlatformWithProof = vi
      .fn()
      .mockRejectedValue(new Error('proof endpoint unavailable'));
    const sdk = createMockSdk({
      system: {
        totalCreditsInPlatform,
        totalCreditsInPlatformWithProof,
      },
    });

    renderWithProviders(<TotalCreditsProbe />, {
      sdk: { sdk, trusted: true, status: 'ready' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('query-state')).toHaveTextContent('success:42:verified');
    });

    expect(totalCreditsInPlatformWithProof).toHaveBeenCalledOnce();
    expect(totalCreditsInPlatform).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.getByTestId('proof-entry')).toHaveTextContent(
        '1:success:Proof capture failed: proof endpoint unavailable',
      );
    });
  });

  it('does not call proof transport when trusted mode is disabled', async () => {
    const totalCreditsInPlatform = vi.fn().mockResolvedValue(77);
    const totalCreditsInPlatformWithProof = vi.fn();
    const sdk = createMockSdk({
      system: {
        totalCreditsInPlatform,
        totalCreditsInPlatformWithProof,
      },
    });

    renderWithProviders(<TotalCreditsProbe />, {
      sdk: { sdk, trusted: false, status: 'ready' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('query-state')).toHaveTextContent(
        'success:77:unverified-trusted-off',
      );
    });

    expect(totalCreditsInPlatformWithProof).not.toHaveBeenCalled();
    expect(totalCreditsInPlatform).toHaveBeenCalledOnce();
  });
});
