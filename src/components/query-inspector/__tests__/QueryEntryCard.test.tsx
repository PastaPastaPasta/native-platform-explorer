import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { CODE_PREVIEW_CHARS, QueryEntryDetail } from '../QueryEntryCard';
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

  const proofOf = (grovedbProof: Uint8Array): QueryProofEntry['proof'] => ({
    grovedbProof, quorumHash: new Uint8Array(), signature: new Uint8Array(), blockIdHash: new Uint8Array(), round: 0, quorumType: 106,
  });

  it('shows a parser failure as a message instead of parser output', async () => {
    parse.mockRejectedValueOnce(new Error('The bytes end before the proof does.'));
    renderWithProviders(<QueryEntryDetail entry={{ ...entry, proof: proofOf(new Uint8Array([1, 2])) }} defaultTabIndex={2} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not parse this proof: The bytes end before the proof does.');
    expect(screen.getByText('0102')).toBeInTheDocument();
    expect(screen.queryByText('Raw parser output')).not.toBeInTheDocument();
  });

  it('renders a preview of a large proof and the full hex only on request', async () => {
    parse.mockRejectedValueOnce(new Error('not a proof'));
    const bytes = new Uint8Array(CODE_PREVIEW_CHARS).fill(0xab);
    renderWithProviders(<QueryEntryDetail entry={{ ...entry, proof: proofOf(bytes) }} defaultTabIndex={2} />);
    await screen.findByRole('alert');
    const total = (bytes.length * 2).toLocaleString();
    expect(screen.getByText(`Showing the first ${CODE_PREVIEW_CHARS.toLocaleString()} of ${total} characters.`)).toBeInTheDocument();
    const code = () => screen.getByText((_, el) => el?.tagName === 'CODE' && /^(ab)+$/.test(el.textContent ?? ''));
    expect(code().textContent).toHaveLength(CODE_PREVIEW_CHARS);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(code().textContent).toHaveLength(bytes.length * 2);
  });
});
