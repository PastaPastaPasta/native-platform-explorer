import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProofGlyph } from '../ProofGlyph';
import { ProofInspector } from '../ProofInspector';

describe('ProofGlyph', () => {
  it('opens the proof inspector with fallback notes when no payload is attached', async () => {
    renderWithProviders(
      <>
        <ProofGlyph status="failed" label="Block height proof failed" />
        <ProofInspector />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Block height proof failed' }));

    expect(await screen.findByText('Proof Inspector')).toBeInTheDocument();
    expect(screen.getAllByText('Block height proof failed')).toHaveLength(2);
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('retains unavailable status for a query from an endpoint without proofs', async () => {
    renderWithProviders(<>
      <ProofGlyph status="unavailable" payload={{ title: 'System status', status: 'unavailable', entry: {
        queryKey: ['system', 'status'], methodName: 'system.status', methodParams: {}, hasProofVariant: false,
        timestamp: 1000, durationMs: 10, status: 'error', error: 'offline', verification: 'unavailable',
      } }} />
      <ProofInspector />
    </>);
    fireEvent.click(screen.getByRole('button', { name: 'Query unavailable; verification not completed' }));
    expect(await screen.findByText('QUERY UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('NO PROOF')).not.toBeInTheDocument();
  });
});
