import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey, wallet } from '@dashevo/evo-sdk';
import { renderWithProviders } from '@/test/render';
import { IdentityTopUpForm } from '../identity/IdentityTopUp';
import { IdentityCreateForm } from '../identity/IdentityCreate';

const TXID = 'a7383eb8e75f425b1da0b67ee735d612a652de1bad5c76d54f972f30b8ff3422';
let wif: string;

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  wif = PrivateKey.fromHex('0'.repeat(63) + '1', 'testnet').toWIF();
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BRIDGE_URL', 'https://bridge.dashhq.org');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function fillChainProof() {
  fireEvent.click(screen.getByRole('radio', { name: /asset-lock proof and its private key/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'Chain lock' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Asset-lock transaction ID' }), {
    target: { value: TXID },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Chain-locked height' }), {
    target: { value: '1579591' },
  });
  fireEvent.change(screen.getByLabelText('Asset-lock private key (WIF)'), {
    target: { value: wif },
  });
}

describe('identity top-up', () => {
  it('recommends the bridge first and offers no review there', () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(
      <IdentityTopUpForm network="testnet" signer={null} onOptionsChange={onOptionsChange} />,
    );
    const bridge = screen.getByRole('link', { name: 'Open bridge →' });
    expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=testnet');
    expect(bridge).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Identity' }), {
      target: { value: 'A'.repeat(43) },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
  });

  it.each([
    { network: 'devnet-tadi' as const, url: 'https://bridge.dashhq.org' },
    { network: 'testnet' as const, url: '' },
    { network: 'testnet' as const, url: 'http://example.com' },
  ])('keeps unavailable bridge configurations hidden: $network / $url', ({ network, url }) => {
    vi.stubEnv('NEXT_PUBLIC_BRIDGE_URL', url);
    renderWithProviders(
      <IdentityTopUpForm network="testnet" signer={null} onOptionsChange={vi.fn()} />,
      { sdk: { network } },
    );
    expect(screen.queryByRole('link', { name: 'Open bridge →' })).not.toBeInTheDocument();
    expect(screen.getByText(/The bridge shortcut is unavailable/)).toBeInTheDocument();
  });

  it('builds a top-up from a chain-lock proof and the asset-lock key', async () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(
      <IdentityTopUpForm network="testnet" signer={null} onOptionsChange={onOptionsChange} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Identity' }), {
      target: { value: 'ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa' },
    });
    fillChainProof();
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith({
        network: 'testnet',
        identityId: 'ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa',
        assetLockKeyWif: wif,
        proof: expect.objectContaining({ type: 'chain', outPoint: `${TXID}:0` }),
      }),
    );
  });
});

describe('identity create', () => {
  it('shows the identity the proof creates and requires the new keys', async () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(
      <IdentityCreateForm network="testnet" signer={null} onOptionsChange={onOptionsChange} />,
    );
    fillChainProof();
    expect(await screen.findByTestId('asset-lock-summary')).toHaveTextContent(
      'creates identity ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa',
    );
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('Wallet mnemonic'), {
      target: { value: 'abandon '.repeat(11) + 'about' },
    });
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          keys: {
            source: {
              kind: 'mnemonic',
              mnemonic: 'abandon '.repeat(11) + 'about',
              identityIndex: 0,
            },
            publicKeyHashes: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{40}$/)]),
          },
        }),
      ),
    );
  });
});
