import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { renderWithProviders } from '@/test/render';
import DocumentPage from '../contract/document/page';
import ContractTokenPage from '../contract/token/page';
import GroupDetailPage from '../groups/detail/page';
import ContestedDetailPage from '../governance/contested/detail/page';

const nav = vi.hoisted(() => ({ params: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/',
}));

const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const DOC = '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6';

beforeEach(() => {
  nav.params = '';
  nav.push.mockClear();
});

describe('detail pages opened without their params', () => {
  it('/contract/document explains itself, links back, and opens a typed-in document', () => {
    nav.params = `id=${CONTRACT}`;
    renderWithProviders(<NuqsTestingAdapter><DocumentPage /></NuqsTestingAdapter>);
    expect(screen.getByRole('heading', { name: 'Document' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open a contract' })).toHaveAttribute('href', expect.stringMatching(new RegExp(`^/contract/?\\?id=${CONTRACT}$`)));
    expect(screen.getByLabelText('Contract ID')).toHaveValue(CONTRACT);
    const open = screen.getByRole('button', { name: 'Open' });
    expect(open).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'domain' } });
    fireEvent.change(screen.getByLabelText('Document ID'), { target: { value: 'nope' } });
    expect(screen.getByText('Expected a 43–44 char base58 string.')).toBeInTheDocument();
    expect(open).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Document ID'), { target: { value: DOC } });
    fireEvent.click(open);
    expect(nav.push).toHaveBeenCalledWith(`/contract/document/?id=${CONTRACT}&type=domain&docId=${DOC}`);
  });

  it('/contract/token takes a contract and token position', () => {
    renderWithProviders(<ContractTokenPage />);
    expect(screen.getByRole('link', { name: 'Token list' })).toHaveAttribute('href', expect.stringMatching(/^\/token\/?$/));
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: CONTRACT } });
    fireEvent.change(screen.getByLabelText('Token position'), { target: { value: '-1' } });
    expect(screen.getByText('Expected a whole number from 0 to 65535.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Token position'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(nav.push).toHaveBeenCalledWith(`/contract/token/?id=${CONTRACT}&position=2`);
  });

  it('/contract/token and /groups/detail treat a position that is not a whole u16 as missing', () => {
    nav.params = `id=${CONTRACT}&position=1.5`;
    const { unmount } = renderWithProviders(<ContractTokenPage />);
    expect(screen.getByLabelText('Token position')).toHaveValue('1.5');
    expect(screen.getByText('Expected a whole number from 0 to 65535.')).toBeInTheDocument();
    unmount();
    nav.params = `contractId=${CONTRACT}&position=-1`;
    renderWithProviders(<GroupDetailPage />);
    expect(screen.getByRole('heading', { name: 'Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
  });

  it('/groups/detail without a position links to the contract\'s groups', () => {
    nav.params = `contractId=${CONTRACT}`;
    renderWithProviders(<GroupDetailPage />);
    expect(screen.getByRole('link', { name: 'Groups of this contract' })).toHaveAttribute('href', expect.stringMatching(new RegExp(`^/groups/?\\?contractId=${CONTRACT}$`)));
    fireEvent.change(screen.getByLabelText('Group position'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(nav.push).toHaveBeenCalledWith(`/groups/detail/?contractId=${CONTRACT}&position=0`);
  });

  it('/governance/contested/detail links to the contested list and opens a DPNS contest', async () => {
    renderWithProviders(<ContestedDetailPage />);
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'Contested resources' })).toHaveAttribute('href', expect.stringMatching(/^\/governance\/contested\/?$/));
    fireEvent.change(screen.getByLabelText('DPNS name'), { target: { value: 'Alice.dash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const href = nav.push.mock.calls[0]![0] as string;
    const url = new URL(href, 'https://x');
    expect(url.pathname).toBe('/governance/contested/detail/');
    expect(url.searchParams.get('contract')).toBe(CONTRACT);
    expect(url.searchParams.get('indexName')).toBe('parentNameAndLabel');
    expect(JSON.parse(url.searchParams.get('indexValues')!)).toEqual(['dash', 'a11ce']);
  });
});
