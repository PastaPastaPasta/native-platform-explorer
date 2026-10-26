import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSigner } from '@/signer/SignerProvider';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { WriteActions } from '../WriteActions';

vi.mock('@/signer/SignerProvider', () => ({ useSigner: vi.fn() }));
const base = { connect: vi.fn(), disconnect: vi.fn(), clearStash: vi.fn() };
const links = [
  { op: 'document.create', label: 'Create' },
  { op: 'document.replace', label: 'Edit', ownsTo: 'owner-1' },
];

describe('WriteActions', () => {
  it.each([
    ['a live signer', { signer: createMockSigner({ identityId: 'owner-1' }), stash: null }],
    // Read pages clear the live signer but keep the public reconnect hint.
    ['the reconnect hint', { signer: null, stash: { kind: 'mnemonic' as const, identityId: 'owner-1' } }],
  ])('shows owner actions for the identity from %s', (_, state) => {
    vi.mocked(useSigner).mockReturnValue({ ...base, ...state });
    renderWithProviders(<WriteActions links={links} />);
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toContain(
      'op=document.replace',
    );
  });

  it('hides owner actions for other identities', () => {
    vi.mocked(useSigner).mockReturnValue({
      ...base,
      signer: null,
      stash: { kind: 'wif', identityId: 'someone-else' },
    });
    renderWithProviders(<WriteActions links={links} />);
    expect(screen.getByRole('link', { name: 'Create' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
