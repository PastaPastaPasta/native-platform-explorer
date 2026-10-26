import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { wallet } from '@dashevo/evo-sdk';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import {
  IdentityCreditWithdrawalForm,
  validateCoreFeePerByte,
  validateWithdrawalAmount,
} from '../IdentityCreditWithdrawal';

let testnetAddress: string;
let mainnetAddress: string;
beforeAll(async () => {
  for (const network of ['testnet', 'mainnet'] as const) {
    const pair = await wallet.keyPairFromHex('0'.repeat(63) + '5', network);
    if (network === 'testnet') testnetAddress = pair.address;
    else mainnetAddress = pair.address;
    pair.free();
  }
});

const props = () => ({
  signer: createMockSigner(),
  network: 'testnet' as const,
  onOptionsChange: vi.fn(),
});

describe('IdentityCreditWithdrawalForm', () => {
  it.each([
    ['1', 1],
    ['89', 89],
  ])('accepts Fibonacci core fees: %s', (text, fee) => {
    expect(validateCoreFeePerByte(text)).toEqual({ fee });
  });
  it.each(['0', '4', '1.5', '144', '0x1', '', '1e0'])('rejects core fee %s', (text) => {
    expect(validateCoreFeePerByte(text).error).toMatch(/Fibonacci/);
  });
  it.each(['0x2e630', '0b1', '189999', '50000000000001', '-190000', '190000.5'])(
    'rejects withdrawal amount %s',
    (text) => {
      expect(validateWithdrawalAmount(text).amount).toBeUndefined();
    },
  );

  it('validates the address checksum and network before allowing review', async () => {
    const options = props();
    renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '200000' } });
    const address = screen.getByLabelText('Destination Dash Core address');

    fireEvent.change(address, { target: { value: mainnetAddress } });
    expect(await screen.findByText(/Not a valid testnet Dash address/)).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);

    const tampered = testnetAddress.slice(0, -1) + (testnetAddress.endsWith('a') ? 'b' : 'a');
    fireEvent.change(address, { target: { value: tampered } });
    expect(await screen.findByText(/Not a valid testnet Dash address/)).toBeInTheDocument();

    fireEvent.change(address, { target: { value: testnetAddress } });
    await waitFor(() =>
      expect(options.onOptionsChange).toHaveBeenLastCalledWith({
        network: 'testnet',
        toAddress: testnetAddress,
        amountCredits: 200000n,
        coreFeePerByte: 1,
      }),
    );

    fireEvent.change(screen.getByLabelText('Core fee per byte'), { target: { value: '4' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
  });

  it('sends no address for owner-key withdrawals to the payout address', async () => {
    const options = props();
    renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.click(screen.getByRole('radio', { name: /masternode payout address/ }));
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '200000' } });
    expect(screen.queryByLabelText('Destination Dash Core address')).not.toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      network: 'testnet',
      amountCredits: 200000n,
      coreFeePerByte: 1,
    });
  });
});
