import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { parseDecimalBigInt } from '../amount';
import { IdentityCreditTransferForm } from '../IdentityCreditTransfer';
import { DocumentSetPriceForm } from '../DocumentSetPrice';
import { DocumentPurchaseForm } from '../DocumentPurchase';

const id = 'A'.repeat(43);
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ contract: 'A'.repeat(43), type: 'note', id: 'A'.repeat(43) }),
}));

const props = () => ({ signer: createMockSigner(), network: 'testnet' as const, onOptionsChange: vi.fn() });

describe('credit amount inputs', () => {
  it.each(['0x10', '0b1', '0o7', '1e3', '1.5', '-1', ' ', '1_000'])('rejects %j', (text) => {
    expect(parseDecimalBigInt(text)).toBeNull();
  });
  it('accepts plain decimal integers', () => {
    expect(parseDecimalBigInt(' 0012 ')).toBe(12n);
  });

  it.each([
    ['transfer', IdentityCreditTransferForm, 'e.g. 100000000'],
    ['set price', DocumentSetPriceForm, 'e.g. 100000000'],
    ['purchase', DocumentPurchaseForm, 'Match the listed price exactly'],
  ] as const)('%s form does not accept hexadecimal amounts', (_, Form, placeholder) => {
    const options = props();
    renderWithProviders(<Form {...options} />);
    if (Form === IdentityCreditTransferForm)
      fireEvent.change(screen.getByPlaceholderText('Base58 identity ID'), { target: { value: id } });
    const amount = screen.getByPlaceholderText(placeholder);
    fireEvent.change(amount, { target: { value: '0x10' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(amount, { target: { value: '16' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(
      expect.objectContaining(Form === IdentityCreditTransferForm ? { amountCredits: 16n } : { priceCredits: 16n }),
    );
  });
});
