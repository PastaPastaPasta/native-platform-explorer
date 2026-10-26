import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { DpnsRegisterForm } from '../DpnsRegister';

const contested = vi.hoisted(() => vi.fn());
vi.mock('@sdk/queries', () => ({
  useDpnsIsContested: (name: string | undefined) => ({
    data: name === undefined ? undefined : contested(name),
    error: null,
  }),
}));

const props = () => ({
  signer: createMockSigner({ identityId: 'signer-identity' }),
  network: 'testnet' as const,
  onOptionsChange: vi.fn(),
});

describe('DpnsRegisterForm', () => {
  it('registers under .dash for the signer identity without an editable identity field', () => {
    contested.mockReturnValue(false);
    const options = props();
    renderWithProviders(<DpnsRegisterForm {...options} />);
    expect(screen.queryByRole('textbox', { name: /identity/i })).not.toBeInTheDocument();
    expect(screen.getByText('signer-identity')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Alice-Long-Name-2024' },
    });
    expect(screen.getByText(/registered as alice-long-name-2024\.dash/)).toBeInTheDocument();
    expect(screen.queryByText(/tdash/)).not.toBeInTheDocument();
    expect(contested).toHaveBeenLastCalledWith('alice-long-name-2024.dash');
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      label: 'alice-long-name-2024',
      contested: false,
    });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains the contest process and fee for contested names', () => {
    contested.mockReturnValue(true);
    const options = props();
    renderWithProviders(<DpnsRegisterForm {...options} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'alice' } });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('alice.dash is a contested name');
    expect(note).toHaveTextContent(/masternodes vote/);
    expect(note).toHaveTextContent(/0\.2 DASH contest fee/);
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({ label: 'alice', contested: true });
  });

  it('waits for the contested check before allowing review', () => {
    contested.mockReturnValue(undefined);
    const options = props();
    renderWithProviders(<DpnsRegisterForm {...options} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'alice' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
  });
});
