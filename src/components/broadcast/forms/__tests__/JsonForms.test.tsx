import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
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
  useSdkQuery: (key: string[]) => ({ data: contracts.get(key[1] ?? ''), isLoading: false }),
}));
vi.mock('../../ContractPicker', () => ({
  ContractPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Contract" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  rememberContract: vi.fn(),
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Contract' }), {
      target: { value: contractB },
    });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('textbox', { name: 'Document schemas' })).not.toBeInTheDocument();
    contracts.set(contractB, { documentSchemas: { second: { type: 'object' } } });
    rerender(<ContractUpdateForm {...options} />);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      contractId: contractB,
      documentSchemas: { second: { type: 'object' } },
    });
  });

  it('clears key-add errors when valid JSON replaces invalid JSON', () => {
    const options = props();
    renderWithProviders(<IdentityUpdateKeysForm {...options} />);
    const adds = screen.getByRole('textbox', { name: /Keys to add/ });
    fireEvent.change(adds, { target: { value: '{}' } });
    expect(screen.getByText('Add-keys must be a JSON array.')).toBeInTheDocument();
    fireEvent.change(adds, { target: { value: '[{"keyId":5}]' } });
    expect(screen.queryByText('Add-keys must be a JSON array.')).not.toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      addPublicKeysJson: [{ keyId: 5 }],
      disableKeyIds: undefined,
    });
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
