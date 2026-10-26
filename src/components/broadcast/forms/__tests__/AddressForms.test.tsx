import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivateKey, wallet } from '@dashevo/evo-sdk';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { AddressTransferForm } from '../addresses/AddressTransfer';
import { RawBroadcastForm } from '../raw/RawBroadcast';

const A = 'tdash1kp63uahgrxged4z5jswyt5dn5v3lzsem6cwarqfg';
const B = 'tdash1krjjyfzq5ecwfckja4al0f4d702th5r5pgrawfla';
let wif: string;

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  wif = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet').toWIF();
});

function renderTransfer(balance: bigint) {
  const onOptionsChange = vi.fn();
  const sdk = createMockSdk({
    addresses: { get: vi.fn().mockResolvedValue({ balance, nonce: 4n }) },
  });
  renderWithProviders(
    <AddressTransferForm network="testnet" signer={null} onOptionsChange={onOptionsChange} />,
    { sdk: { sdk, status: 'ready' } },
  );
  return onOptionsChange;
}

function fillTransfer(amount: string) {
  fireEvent.change(screen.getByLabelText('Sending address private key (WIF)'), {
    target: { value: wif },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Recipient 1 address' }), {
    target: { value: B },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Recipient 1 amount (credits)' }), {
    target: { value: amount },
  });
}

describe('address transfer form', () => {
  it('shows the address the key controls and builds exact outputs', async () => {
    const onOptionsChange = renderTransfer(10n ** 12n);
    fillTransfer('50000000');
    await waitFor(() =>
      expect(screen.getByTestId('address-key-status')).toHaveTextContent(
        `Address ${A} · balance 1,000,000,000,000 credits · nonce 4`,
      ),
    );
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith({
        network: 'testnet',
        inputKeyWif: wif,
        fromAddress: A,
        outputs: [{ address: B, amountCredits: 50_000_000n }],
        feeFrom: 'sender',
      }),
    );
    expect(document.body.textContent).not.toContain(wif);
  });

  it('blocks review when the address cannot pay the amount plus the minimum fee', async () => {
    const onOptionsChange = renderTransfer(50_000_000n);
    fillTransfer('50000000');
    expect(await screen.findByText(/plus a fee of at least 6,500,000 credits/)).toBeInTheDocument();
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
  });
});

describe('raw broadcast form', () => {
  it('decodes a pasted transition and reports undecodable input', async () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(
      <RawBroadcastForm network="testnet" signer={null} onOptionsChange={onOptionsChange} />,
    );
    const field = screen.getByRole('textbox', { name: 'Signed state transition (hex or base64)' });
    fireEvent.change(field, { target: { value: 'zz' } });
    expect(await screen.findByText('Expected hex or base64.')).toBeInTheDocument();
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
  });
});
