import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { DocumentReplaceForm } from '../DocumentReplace';

const contractA = 'A'.repeat(43);
const contractB = 'B'.repeat(43);
const doc1 = '1'.repeat(43);
const doc2 = '2'.repeat(43);
const data = vi.hoisted(() => new Map<string, unknown>());
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams({ contract: 'A'.repeat(43), type: 'note', id: '1'.repeat(43) }),
}));
vi.mock('@sdk/hooks', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSdkQuery: (key: string[]) => ({
    data: data.get(key.join('|')),
    isLoading: false,
    refetch: async () => ({ data: data.get(key.join('|')) }),
  }),
}));

const schema = {
  type: 'object',
  properties: { title: { type: 'string', position: 0 } },
  additionalProperties: false,
};
beforeEach(() => {
  data.clear();
  data.set(`contract|${contractA}`, { documentSchemas: { note: schema } });
  data.set(`document|${contractA}|note|${doc1}`, {
    id: doc1,
    revision: 5n,
    properties: { title: 'first' },
  });
});

const props = () => ({
  signer: createMockSigner(),
  network: 'testnet' as const,
  onOptionsChange: vi.fn(),
});

describe('DocumentReplaceForm', () => {
  it('never pairs one document with another document’s properties or revision', () => {
    const options = props();
    const { rerender } = renderWithProviders(<DocumentReplaceForm {...options} />);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentId: doc1,
        currentRevision: 5n,
        properties: { title: 'first' },
      }),
    );

    fireEvent.change(screen.getByPlaceholderText('Base58 document ID'), {
      target: { value: doc2 },
    });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/Revision:/)).not.toBeInTheDocument();

    data.set(`document|${contractA}|note|${doc2}`, {
      id: doc2,
      revision: 2n,
      properties: { title: 'second' },
    });
    rerender(<DocumentReplaceForm {...options} />);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentId: doc2,
        currentRevision: 2n,
        properties: { title: 'second' },
      }),
    );
    expect(screen.getByText('Revision: 2 → 3')).toBeInTheDocument();
  });

  it('resets when the contract changes, even for the same type and document ID', () => {
    data.set(`contract|${contractB}`, { documentSchemas: { note: schema } });
    const options = props();
    const { rerender } = renderWithProviders(<DocumentReplaceForm {...options} />);
    fireEvent.change(screen.getByPlaceholderText('Contract ID (Base58)'), {
      target: { value: contractB },
    });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByDisplayValue('first')).not.toBeInTheDocument();

    data.set(`document|${contractB}|note|${doc1}`, {
      id: doc1,
      revision: 1n,
      properties: { title: 'other contract' },
    });
    rerender(<DocumentReplaceForm {...options} />);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contractId: contractB,
        currentRevision: 1n,
        properties: { title: 'other contract' },
      }),
    );
  });

  it('ignores a fetched document whose ID does not match the requested one', () => {
    data.set(`document|${contractA}|note|${doc1}`, {
      id: doc2,
      revision: 9n,
      properties: { title: 'stale' },
    });
    const options = props();
    renderWithProviders(<DocumentReplaceForm {...options} />);
    expect(options.onOptionsChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ currentRevision: 9n }),
    );
  });
});
