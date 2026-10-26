import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { wallet } from '@dashevo/evo-sdk';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { IdentityUpdateKeysForm, redactIdentityUpdateKeys } from '../IdentityUpdateKeys';

let testnetWif: string;
let mainnetWif: string;
beforeAll(async () => {
  const testnet = await wallet.keyPairFromHex('0'.repeat(63) + '2', 'testnet');
  const mainnet = await wallet.keyPairFromHex('0'.repeat(63) + '3', 'mainnet');
  testnetWif = testnet.privateKeyWif;
  mainnetWif = mainnet.privateKeyWif;
  testnet.free();
  mainnet.free();
});

const props = () => ({
  signer: createMockSigner(),
  network: 'testnet' as const,
  onOptionsChange: vi.fn(),
});

describe('IdentityUpdateKeysForm', () => {
  it('requires a private key on the current network for each added key', async () => {
    const options = props();
    renderWithProviders(<IdentityUpdateKeysForm {...options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a key' }));
    const wif = screen.getByLabelText('New key 1 private key (WIF)');
    expect(wif).toHaveAttribute('type', 'text');
    expect(wif).toHaveAttribute('data-1p-ignore');

    fireEvent.change(wif, { target: { value: 'not-a-wif' } });
    expect(await screen.findByText('Not a valid WIF private key.')).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(wif, { target: { value: mainnetWif } });
    expect(await screen.findByText('This private key is for mainnet, not testnet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New key 1 purpose'), { target: { value: 'TRANSFER' } });
    fireEvent.change(wif, { target: { value: testnetWif } });
    await waitFor(() =>
      expect(options.onOptionsChange).toHaveBeenLastCalledWith({
        network: 'testnet',
        addKeys: [
          {
            purpose: 'TRANSFER',
            securityLevel: 'CRITICAL',
            keyType: 'ECDSA_SECP256K1',
            privateKeyWif: testnetWif,
          },
        ],
        disableKeyIds: undefined,
      }),
    );
  });

  it('rejects the same private key twice', async () => {
    const options = props();
    renderWithProviders(<IdentityUpdateKeysForm {...options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a key' }));
    fireEvent.change(screen.getByLabelText('New key 1 private key (WIF)'), { target: { value: testnetWif } });
    fireEvent.change(screen.getByLabelText('New key 2 private key (WIF)'), { target: { value: testnetWif } });
    expect(await screen.findByText('The same private key is listed twice.')).toBeInTheDocument();
    expect(options.onOptionsChange).toHaveBeenLastCalledWith(null);
  });

  it('keeps disable-only updates working without new keys', async () => {
    const options = props();
    renderWithProviders(<IdentityUpdateKeysForm {...options} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Key IDs to disable' }), {
      target: { value: '4, 5' },
    });
    await waitFor(() =>
      expect(options.onOptionsChange).toHaveBeenLastCalledWith({
        network: 'testnet',
        addKeys: undefined,
        disableKeyIds: [4, 5],
      }),
    );
  });

  it('never shows the new private keys in the review data', () => {
    const review = redactIdentityUpdateKeys({
      network: 'testnet',
      addKeys: [
        { purpose: 'AUTHENTICATION', securityLevel: 'HIGH', keyType: 'ECDSA_SECP256K1', privateKeyWif: 'secret-wif' },
      ],
    });
    expect(JSON.stringify(review)).not.toContain('secret-wif');
    expect(review.addKeys?.[0]).toMatchObject({ purpose: 'AUTHENTICATION', privateKey: 'provided (hidden)' });
  });
});
