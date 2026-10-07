import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { QueryEntryDetail } from '../QueryEntryCard';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';

const parse = vi.hoisted(() => vi.fn().mockResolvedValue('{}'));
vi.mock('@/lib/grovedb-proof-parser', () => ({ parseGrovedbProof: parse }));

const entry: QueryProofEntry = {
  queryKey: ['npe', 'mainnet', true, 'identity'], methodName: 'identities.fetch', methodParams: {}, hasProofVariant: true,
  timestamp: 1000, durationMs: 10, status: 'success', network: 'mainnet', trusted: true, verification: 'verified',
  quorumKeySource: 'https://quorums.mainnet.networks.dash.org', result: 'identity',
};

describe('query provenance', () => {
  it.each([0, 2])('shows an aggregate limitation independently of the selected lazy tab %s', (defaultTabIndex) => {
    const captureNote = 'Combined results from separate SDK-verified batches. No single proof payload or response height covers this range.';
    renderWithProviders(<QueryEntryDetail entry={{ ...entry, captureNote }} defaultTabIndex={defaultTabIndex} />);
    expect(screen.getByText(captureNote)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export evidence JSON' })).toBeVisible();
  });

  it('shows captured network context rather than the currently selected SDK network', () => {
    renderWithProviders(<QueryEntryDetail entry={entry} />, { sdk: { network: 'testnet' } });
    expect(screen.getByText('mainnet')).toBeInTheDocument();
    expect(screen.getByText('1970-01-01T00:00:01.000Z')).toBeInTheDocument();
    expect(screen.getByText('Not captured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export evidence JSON' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Proof' }));
    expect(screen.getByText(/successful trusted SDK query can still verify internally/)).toBeInTheDocument();
    expect(screen.queryByText(/unproven fallback/)).not.toBeInTheDocument();
  });

  it('loads the proof parser only after the user opens the Proof tab', async () => {
    parse.mockClear();
    renderWithProviders(<QueryEntryDetail entry={{ ...entry, proof: { grovedbProof: new Uint8Array([1]), quorumHash: new Uint8Array(), signature: new Uint8Array(), blockIdHash: new Uint8Array(), round: 0, quorumType: 106 } }} />);
    expect(parse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Result' }));
    expect(parse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Proof' }));
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
  });
});
