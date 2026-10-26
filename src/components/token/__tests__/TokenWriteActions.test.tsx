import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSigner } from '@/signer/SignerProvider';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { TokenWriteActions } from '../TokenWriteActions';
import { CONTRACT_ID, MEMBER, OWNER, STRANGER, TOKEN_ID, contractObject } from '@components/broadcast/tokens/__tests__/fixtures';

vi.mock('@/signer/SignerProvider', () => ({ useSigner: vi.fn() }));
vi.mock('@sdk/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTokenIdentityBalances: (identityId: string | undefined) => ({
    data: new Map([[TOKEN_ID, identityId === OWNER ? 5n : 0n]]),
  }),
}));
const base = { connect: vi.fn(), disconnect: vi.fn(), clearStash: vi.fn() };

function renderFor(identityId: string | null, forSale = false) {
  vi.mocked(useSigner).mockReturnValue({
    ...base,
    signer: identityId ? createMockSigner({ identityId }) : null,
    stash: null,
  });
  return renderWithProviders(
    <TokenWriteActions tokenId={TOKEN_ID} contractId={CONTRACT_ID} position={0} contract={contractObject()} forSale={forSale} />,
  );
}

const labels = () => screen.queryAllByRole('link').map((link) => link.textContent);

describe('TokenWriteActions', () => {
  it('offers the owner every operation its rules allow, linked to the token', () => {
    renderFor(OWNER, true);
    expect(labels()).toEqual([
      'Mint', 'Burn', 'Freeze', 'Unfreeze', 'Destroy frozen funds', 'Pause / resume', 'Set price', 'Transfer', 'Buy', 'Claim', 'Update config',
    ]);
    const href = screen.getByRole('link', { name: 'Mint' }).getAttribute('href')!;
    expect(new URL(href, 'https://x.invalid').searchParams.get('op')).toBe('token.mint');
    expect(new URL(href, 'https://x.invalid').searchParams.get('token')).toBe(TOKEN_ID);
  });

  it('offers a group member only what the group governs, and others what anyone may do', () => {
    renderFor(MEMBER);
    expect(labels()).toEqual(['Update config']);
  });

  it('shows nothing without a connected or remembered identity', () => {
    renderFor(null, true);
    expect(labels()).toEqual([]);
    renderFor(STRANGER, false);
    expect(labels()).toEqual([]);
  });
});
