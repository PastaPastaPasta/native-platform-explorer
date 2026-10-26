import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { wallet } from '@dashevo/evo-sdk';
import { useCurrentEpoch } from '@sdk/queries';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import type * as QueriesModule from '@sdk/queries';
import {
  IdentityCreditWithdrawalForm,
  minWithdrawalCredits,
  validateCoreFeePerByte,
  validateWithdrawalAmount,
} from '../IdentityCreditWithdrawal';

vi.mock('@sdk/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof QueriesModule>()),
  useCurrentEpoch: vi.fn(),
}));
const useCurrentEpochMock = vi.mocked(useCurrentEpoch);
function currentEpoch(state: { protocolVersion?: number; isError?: boolean }) {
  useCurrentEpochMock.mockReturnValue({
    data: state.protocolVersion === undefined ? undefined : { protocolVersion: state.protocolVersion },
    isError: state.isError ?? false,
  } as unknown as ReturnType<typeof useCurrentEpoch>);
}
beforeEach(() => currentEpoch({ protocolVersion: 14 }));

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
      expect(validateWithdrawalAmount(text, 11).amount).toBeUndefined();
    },
  );

  // rs-platform-version: SYSTEM_LIMITS_V1 (v1–v11) vs SYSTEM_LIMITS_V2+ (v12 on).
  it.each([
    [1, 190_000n],
    [11, 190_000n],
    [12, 1_000_000n],
    [14, 1_000_000n],
    [undefined, 1_000_000n],
  ])('requires the protocol %s minimum of %s credits', (version, minimum) => {
    expect(minWithdrawalCredits(version)).toBe(minimum);
    expect(validateWithdrawalAmount(String(minimum), version)).toEqual({ amount: minimum });
    expect(validateWithdrawalAmount(String(minimum - 1n), version).error).toMatch(
      `Withdrawals must be ${minimum.toLocaleString('en-US')} to 50,000,000,000,000 credits`,
    );
  });

  it('applies the network protocol minimum and records the version it used', async () => {
    const options = props();
    renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.click(screen.getByRole('radio', { name: /masternode payout address/ }));
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '200000' } });
    expect(screen.getByText(/Withdrawals must be 1,000,000 to/)).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '1000000' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      network: 'testnet',
      amountCredits: 1_000_000n,
      coreFeePerByte: 1,
      protocolVersion: 14,
    });
  });

  it('waits for the protocol version and falls back to the stricter minimum', () => {
    currentEpoch({});
    const options = props();
    const { rerender } = renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.click(screen.getByRole('radio', { name: /masternode payout address/ }));
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '1000000' } });
    expect(screen.getByText(/Checking the network protocol version/)).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);

    currentEpoch({ isError: true });
    rerender(<IdentityCreditWithdrawalForm {...options} />);
    expect(screen.getByText(/strictest minimum applies/)).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      network: 'testnet',
      amountCredits: 1_000_000n,
      coreFeePerByte: 1,
    });
  });

  it('validates the address checksum and network before allowing review', async () => {
    const options = props();
    renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '1000000' } });
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
        amountCredits: 1_000_000n,
        coreFeePerByte: 1,
        protocolVersion: 14,
      }),
    );

    fireEvent.change(screen.getByLabelText('Core fee per byte'), { target: { value: '4' } });
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
  });

  it('sends no address for owner-key withdrawals to the payout address', async () => {
    currentEpoch({ protocolVersion: 11 });
    const options = props();
    renderWithProviders(<IdentityCreditWithdrawalForm {...options} />);
    fireEvent.click(screen.getByRole('radio', { name: /masternode payout address/ }));
    fireEvent.change(screen.getByLabelText('Amount (credits)'), { target: { value: '200000' } });
    expect(screen.queryByLabelText('Destination Dash Core address')).not.toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith({
      network: 'testnet',
      amountCredits: 200000n,
      coreFeePerByte: 1,
      protocolVersion: 11,
    });
  });
});
