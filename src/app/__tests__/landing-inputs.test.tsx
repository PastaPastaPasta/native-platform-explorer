import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import AddressPage from '../address/page';
import IdentityLookupPage from '../identity/lookup/page';
import GroupsPage from '../groups/page';

const nav = vi.hoisted(() => ({ params: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
  useRouter: () => ({ push: nav.push }),
}));

const TESTNET = 'tdash1kqrswpc8qurswpc8qurswpc8qurswpc8qu8dr2j6';
const MAINNET = 'dash1kqrswpc8qurswpc8qurswpc8qurswpc8quh2s5r5';

beforeEach(() => {
  nav.params = '';
  nav.push.mockClear();
});

describe('landing inputs', () => {
  it('/address validates the Platform address for the current network', () => {
    renderWithProviders(<AddressPage />);
    const input = screen.getByLabelText('Platform address');
    fireEvent.change(input, { target: { value: MAINNET } });
    expect(screen.getByText(/belong to mainnet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled();
    fireEvent.change(input, { target: { value: TESTNET } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(nav.push).toHaveBeenCalledWith(`/address/?addr=${TESTNET}`);
  });

  it('/identity/lookup takes a public-key hash and flags an invalid one from the URL', () => {
    nav.params = 'pkh=xyz';
    renderWithProviders(<IdentityLookupPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('is not a 40-character hex public-key hash');
    fireEvent.change(screen.getByLabelText('Public-key hash'), { target: { value: 'AB'.repeat(20) } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(nav.push).toHaveBeenCalledWith(`/identity/lookup/?pkh=${'ab'.repeat(20)}`);
  });

  it('/groups asks for a contract and explains when no well-known contract has groups', () => {
    renderWithProviders(<GroupsPage />);
    expect(screen.getByText(/None of the well-known contracts on this network define groups/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: 'short' } });
    expect(screen.getByText('Expected a 43–44 char base58 string.')).toBeInTheDocument();
  });
});
