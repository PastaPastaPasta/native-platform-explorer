import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { ContractRegisterForm } from '../ContractRegister';
import { ContractUpdateForm } from '../ContractUpdate';
import { IdentityUpdateKeysForm } from '../IdentityUpdateKeys';

const contractA = 'A'.repeat(43);
const contractB = 'B'.repeat(43);
const contracts = vi.hoisted(() => new Map<string, unknown>());
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ contract: 'A'.repeat(43) }),
}));
vi.mock('@sdk/hooks', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSdkQuery: (key: string[]) => ({
    data: contracts.get(key[1] ?? ''),
    isLoading: false,
    refetch: async () => ({ data: contracts.get(key[1] ?? '') }),
  }),
}));

beforeEach(() => {
  contracts.clear();
});
const props = () => ({
  signer: createMockSigner(),
  network: 'testnet' as const,
  onOptionsChange: vi.fn(),
});

describe('JSON operation forms', () => {
  it('updates register-schema validation without a render-time state update', () => {
    const options = props();
    renderWithProviders(<ContractRegisterForm {...options} />);
    const schemas = screen.getByRole('textbox', { name: 'Document schemas' });
    fireEvent.change(schemas, { target: { value: '[]' } });
    expect(screen.getByText('documentSchemas must be a JSON object.')).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(schemas, {
      target: { value: JSON.stringify({ note: { type: 'object', properties: {} } }) },
    });
    expect(screen.queryByText('documentSchemas must be a JSON object.')).not.toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      ownerId: 'identity-1',
      documentSchemas: { note: { type: 'object', properties: {} } },
    });
  });

  it('does not retain one contract schema when the contract picker changes', () => {
    contracts.set(contractA, { documentSchemas: { first: { type: 'object' } } });
    const options = props();
    const { rerender } = renderWithProviders(<ContractUpdateForm {...options} />);
    expect(screen.getByRole('textbox', { name: 'Document schemas' })).toHaveValue(
      JSON.stringify({ first: { type: 'object' } }, null, 2),
    );
    fireEvent.change(screen.getByPlaceholderText('Contract ID (Base58)'), {
      target: { value: contractB },
    });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('textbox', { name: 'Document schemas' })).not.toBeInTheDocument();
    contracts.set(contractB, { documentSchemas: { second: { type: 'object' } } });
    rerender(<ContractUpdateForm {...options} />);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      contractId: contractB,
      documentSchemas: { second: { type: 'object' } },
      definitions: null,
    });
  });

  it.each(['{"draft":{"type":"object"}}', '{unfinished'])(
    'preserves schema edits when the current recent contract is selected: %s',
    async (draft) => {
      contracts.set(contractA, { documentSchemas: { first: { type: 'object' } } });
      window.localStorage.setItem(
        'npe:recentContracts',
        JSON.stringify([{ id: contractA, ts: Date.now(), label: 'Current contract' }]),
      );
      const options = props();
      renderWithProviders(<ContractUpdateForm {...options} />);
      const schemas = screen.getByRole('textbox', { name: 'Document schemas' });
      fireEvent.change(schemas, { target: { value: draft } });
      const lastOptions = options.onOptionsChange.mock.lastCall;

      fireEvent.click(screen.getByRole('button', { name: /Current contract/ }));

      expect(screen.getByRole('textbox', { name: 'Document schemas' })).toHaveValue(draft);
      expect(options.onOptionsChange.mock.lastCall).toEqual(lastOptions);

      fireEvent.click(screen.getByRole('button', { name: 'Reset to on-chain' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Document schemas' })).toHaveValue(
          JSON.stringify({ first: { type: 'object' } }, null, 2),
        ),
      );
    },
  );

  it('preserves schema edits when only contract identifier whitespace changes', () => {
    contracts.set(contractA, { documentSchemas: { first: { type: 'object' } } });
    const options = props();
    renderWithProviders(<ContractUpdateForm {...options} />);
    const draft = { draft: { type: 'object' } };
    const schemas = screen.getByRole('textbox', { name: 'Document schemas' });
    fireEvent.change(schemas, { target: { value: JSON.stringify(draft) } });

    fireEvent.change(screen.getByPlaceholderText('Contract ID (Base58)'), {
      target: { value: ` ${contractA} ` },
    });

    expect(screen.getByPlaceholderText('Contract ID (Base58)')).toHaveValue(` ${contractA} `);
    expect(screen.getByRole('textbox', { name: 'Document schemas' })).toHaveValue(JSON.stringify(draft));
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      contractId: contractA,
      documentSchemas: draft,
      definitions: null,
    });
  });

  it('loads on-chain definitions and the base version into contract updates', async () => {
    const defs = { title: { type: 'string', maxLength: 63 } };
    contracts.set(contractA, {
      version: 4,
      documentSchemas: { first: { type: 'object' } },
      toJSON: () => ({ schemaDefs: defs }),
    });
    const options = props();
    renderWithProviders(<ContractUpdateForm {...options} />);
    const definitions = screen.getByRole('textbox', { name: /Schema definitions/ });
    expect(definitions).toHaveValue(JSON.stringify(defs, null, 2));
    expect(screen.getByText(/Publishes version 5 \(on-chain version 4\)/)).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      contractId: contractA,
      baseVersion: 4,
      documentSchemas: { first: { type: 'object' } },
      definitions: defs,
    });

    fireEvent.change(definitions, { target: { value: '[]' } });
    expect(screen.getByText('Definitions must be a JSON object.')).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(definitions, { target: { value: '' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ definitions: null }),
    );
    // Reset refetches, so a newer on-chain version replaces the stale base.
    contracts.set(contractA, {
      version: 5,
      documentSchemas: { first: { type: 'object' } },
      toJSON: () => ({ schemaDefs: defs }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to on-chain' }));
    await waitFor(() => expect(definitions).toHaveValue(JSON.stringify(defs, null, 2)));
    expect(screen.getByText(/Publishes version 6 \(on-chain version 5\)/)).toBeInTheDocument();
  });

  it('registers contracts with optional definitions', () => {
    const options = props();
    renderWithProviders(<ContractRegisterForm {...options} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Schema definitions/ }), {
      target: { value: '{"title":{"type":"string"}}' },
    });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ definitions: { title: { type: 'string' } } }),
    );
  });

  it.each(['1,wrong', '-1', '1.5', '4294967296', '1e2'])(
    'rejects invalid disable-key IDs: %s',
    (input) => {
      const options = props();
      renderWithProviders(<IdentityUpdateKeysForm {...options} />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Key IDs to disable' }), {
        target: { value: input },
      });
      expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
      expect(screen.getByText(/unsigned 32-bit integers/)).toBeInTheDocument();
    },
  );
});
