import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQueryProofStore } from '@contexts/QueryProofStore';
import { useTotalCreditsInPlatform } from '../queries';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { nativeProofError, SDK_PROOF_CONTEXT_MESSAGE, SDK_PROOF_DECODE_MESSAGE } from '@/test/proof-errors';
import { normalizeError } from '../errors';
import { createEvidenceBundle } from '../evidence';
import { describeProofState } from '../proofs';

function TotalCreditsProbe() {
  const query = useTotalCreditsInPlatform();
  const store = useQueryProofStore();
  const firstEntry = store.entries[0];
  return (
    <>
      <div data-testid="query-state">
        {query.status}:{String(query.data ?? '')}:{query.proofState.kind}
      </div>
      <div data-testid="proof-label">{describeProofState(query.proofState)}</div>
      <div data-testid="evidence-outcome">{createEvidenceBundle(store.entries).queries[0]?.verification.outcome}</div>
      <div data-testid="proof-entry">
        {store.entries.length}:{firstEntry?.status ?? ''}:{firstEntry?.error ?? ''}:{firstEntry?.proofCaptureError ?? ''}:{firstEntry?.verification ?? ''}:{firstEntry?.network ?? ''}:{String(firstEntry?.trusted ?? '')}:{firstEntry?.resultCaptureError ?? ''}
      </div>
      <button onClick={() => store.setEnabled(false)}>Disable inspector</button>
      <button onClick={() => store.setEnabled(true)}>Enable inspector</button>
      <button onClick={store.clear}>Clear inspector</button>
      <button onClick={() => query.refetch()}>Refresh query</button>
    </>
  );
}

describe('SDK query proof flow', () => {
  it.each(['raw', 'normalized', 'wrapped'])('never retries the actual unsupported WASM context error and exports unavailable (%s)', async (shape) => {
    const native = nativeProofError(SDK_PROOF_CONTEXT_MESSAGE);
    const error = shape === 'raw' ? native : shape === 'normalized' ? normalizeError(native) : new Error('Proof request failed', { cause: native });
    const ordinary = vi.fn();
    const capture = vi.fn().mockRejectedValue(error);
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: capture } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('error::unavailable'));
    expect(ordinary).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledOnce();
    expect(screen.getByTestId('proof-label')).toHaveTextContent('proof verification was not completed');
    expect(screen.getByTestId('evidence-outcome')).toHaveTextContent('unavailable');
  });

  it.each(['raw', 'wrapped'])('never falls back on the live native decoder error and exports unavailable (%s)', async (shape) => {
    const native = nativeProofError();
    const error = shape === 'raw' ? native : new Error('Proof request failed', { cause: native });
    const ordinary = vi.fn().mockResolvedValue(42);
    const capture = vi.fn().mockRejectedValue(error);
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: capture } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('error::unavailable'));
    expect(ordinary).not.toHaveBeenCalled();
    expect(screen.getByTestId('proof-label')).toHaveTextContent('proof verification was not completed');
    expect(screen.getByTestId('evidence-outcome')).toHaveTextContent('unavailable');
    expect(screen.getByTestId('proof-entry')).toHaveTextContent(shape === 'raw' ? `Proof [-1]: ${SDK_PROOF_DECODE_MESSAGE}` : 'Proof request failed');
  });

  it('records capture unavailability separately from successful internal SDK verification', async () => {
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
        '1:success::proof endpoint unavailable:verified:testnet:true',
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

  it('keeps missing captured bytes independent from successful verification', async () => {
    const sdk = createMockSdk({ system: { totalCreditsInPlatformWithProof: vi.fn().mockResolvedValue({ data: 42, metadata: { height: 123 } }) } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:42:verified'));
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('1:success:::verified:testnet:true');
  });

  it.each(['state root differs', 'invalid quorum signature', 'unrecognized native proof failure'])('never retries a native proof failure through the ordinary method: %s', async (message) => {
    const ordinary = vi.fn().mockResolvedValue(42);
    const capture = vi.fn().mockRejectedValue(nativeProofError(message));
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: capture } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('error::failed'));
    expect(ordinary).not.toHaveBeenCalled();
    expect(screen.getByTestId('proof-entry')).toHaveTextContent(`1:error:Proof [-1]: ${message}::failed:testnet:true`);
    expect(screen.getByTestId('evidence-outcome')).toHaveTextContent('failed');
  });

  it('does not report a missing proof response as a verified absent value', async () => {
    const ordinary = vi.fn().mockResolvedValue(42);
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: vi.fn().mockResolvedValue(undefined) } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:42:verified'));
    expect(ordinary).toHaveBeenCalledOnce();
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('Proof capture returned no response.');
  });

  it('does not fail or retry a successful SDK query when the inspector cannot serialize its result', async () => {
    const result: { self?: unknown } = {};
    result.self = result;
    const ordinary = vi.fn();
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: vi.fn().mockResolvedValue({ data: result }) } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:[object Object]:verified'));
    expect(ordinary).not.toHaveBeenCalled();
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('Maximum call stack size exceeded');
  });

  it('describes network outages as unavailable and preserves capture diagnostics separately', async () => {
    const sdk = createMockSdk({ system: {
      totalCreditsInPlatformWithProof: vi.fn().mockRejectedValue(new Error('capture endpoint unavailable')),
      totalCreditsInPlatform: vi.fn().mockRejectedValue(new Error('network offline')),
    } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('error::unavailable'));
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('1:error:network offline:capture endpoint unavailable:unavailable:testnet:true');
  });

  it.each(['disable', 'disable-enable', 'clear'])('does not repopulate the inspector after %s while a response is delayed', async (action) => {
    let resolve!: (value: unknown) => void;
    const capture = vi.fn(() => new Promise((r) => { resolve = r; }));
    const sdk = createMockSdk({ system: { totalCreditsInPlatformWithProof: capture } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(capture).toHaveBeenCalledOnce());
    if (action === 'clear') fireEvent.click(screen.getByRole('button', { name: 'Clear inspector' }));
    else {
      fireEvent.click(screen.getByRole('button', { name: 'Disable inspector' }));
      if (action === 'disable-enable') fireEvent.click(screen.getByRole('button', { name: 'Enable inspector' }));
    }
    await act(async () => resolve({ data: 42 }));
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:42:verified'));
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('0:');
  });

  it('uses ordinary internal verification without retaining bytes when the inspector is disabled', async () => {
    const ordinary = vi.fn().mockResolvedValue(42);
    const capture = vi.fn().mockResolvedValue({ data: 99 });
    const sdk = createMockSdk({ system: { totalCreditsInPlatform: ordinary, totalCreditsInPlatformWithProof: capture } });
    renderWithProviders(<TotalCreditsProbe />, { sdk: { sdk, trusted: true } });
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:99:verified'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable inspector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh query' }));
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('success:42:verified'));
    expect(ordinary).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
    expect(screen.getByTestId('proof-entry')).toHaveTextContent('0:');
  });
});
