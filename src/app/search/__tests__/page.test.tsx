import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from '../page';

const state = vi.hoisted(() => ({
  q: '',
  sdk: { network: 'testnet', status: 'ready', error: null as Error | null, reconnect: vi.fn() },
  identity: { data: null as unknown, isLoading: false, isSuccess: true, isError: false, error: null as Error | null, refetch: vi.fn() },
  dpns: { data: null as unknown, isLoading: false, isSuccess: true, isError: false, error: null as Error | null, refetch: vi.fn() },
  nonUnique: { data: [] as unknown, isLoading: false, isSuccess: true, isError: false, error: null as Error | null, refetch: vi.fn() },
  empty: { data: null, isLoading: false, isSuccess: true, isError: false, error: null, refetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ q: state.q }) }));
vi.mock('@sdk/hooks', () => ({ useSdk: () => state.sdk }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
vi.mock('@components/search/GlobalSearchInput', () => ({ GlobalSearchInput: () => <input aria-label="Search" /> }));
vi.mock('@sdk/queries', () => ({
  useIdentity: () => state.identity,
  useContract: () => state.empty,
  useTokenTotalSupply: () => state.empty,
  useAddressInfo: () => state.empty,
  useIdentityByPublicKeyHash: () => state.empty,
  useIdentitiesByNonUniquePkh: () => state.nonUnique,
  useDpnsGetByName: () => state.dpns,
}));

describe('search resolution states', () => {
  beforeEach(() => {
    state.q = '';
    state.sdk.status = 'ready';
    state.sdk.error = null;
    Object.assign(state.identity, { data: null, isLoading: false, isSuccess: true, isError: false, error: null });
    Object.assign(state.dpns, { data: null, isLoading: false, isSuccess: true, isError: false, error: null });
    Object.assign(state.nonUnique, { data: [], isLoading: false, isSuccess: true, isError: false, error: null });
    vi.clearAllMocks();
  });

  it('starts with an instruction instead of a false missing result', () => {
    render(<SearchPage />);
    expect(screen.getByText('Enter a query to start exploring.')).toBeInTheDocument();
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
  });

  it('distinguishes invalid format from a completed not-found lookup', () => {
    state.q = '!invalid!';
    const { unmount } = render(<SearchPage />);
    expect(screen.getByRole('heading', { name: 'Invalid search input' })).toBeInTheDocument();
    unmount();
    state.q = 'alice.dash';
    state.dpns.data = [];
    render(<SearchPage />);
    expect(screen.getByRole('heading', { name: 'No matching entity found' })).toBeInTheDocument();
    expect(screen.getByText(/lookups completed successfully/i)).toHaveTextContent('testnet');
  });

  it('shows an error with retry instead of reporting the entity as missing', () => {
    state.q = 'alice.dash';
    state.dpns.isError = true;
    state.dpns.error = new Error('Network timeout');
    render(<SearchPage />);
    expect(screen.getByText(/DPNS: Network timeout/)).toBeInTheDocument();
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.dpns.refetch).toHaveBeenCalledOnce();
    expect(state.identity.refetch).not.toHaveBeenCalled();
  });

  it('preserves a successful match and discloses failed alternate lookups', () => {
    state.q = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
    state.identity.data = { id: state.q };
    state.dpns.isError = true;
    state.dpns.error = new Error('Connection lost');
    render(<SearchPage />);
    expect(screen.getByRole('heading', { name: 'Some lookups could not be completed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Open Identity ${state.q} on testnet` }).getAttribute('href')).toMatch(new RegExp(`/identity/?\\?id=${state.q}&network=testnet`));
  });

  it('offers reconnect when the SDK failed before any query could run', () => {
    state.q = 'alice.dash';
    state.sdk.status = 'error';
    state.sdk.error = new Error('Unable to initialize SDK');
    state.dpns.isLoading = true;
    render(<SearchPage />);
    expect(screen.getByRole('heading', { name: 'Search unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.sdk.reconnect).toHaveBeenCalledOnce();
    expect(state.dpns.refetch).not.toHaveBeenCalled();
  });

  it('labels format-only destinations as lookups rather than confirmed matches', () => {
    state.q = '42';
    render(<SearchPage />);
    expect(screen.getByText('Epoch · open lookup')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Epoch 42 on testnet' }).getAttribute('href')).toMatch(/\/epoch\/detail\/?\?index=42&network=testnet/);
  });

  it('never reports a still-pending lookup as absent', () => {
    state.q = 'alice.dash';
    state.dpns.isSuccess = false;
    state.dpns.isLoading = true;
    render(<SearchPage />);
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
  });

  it('resolves non-unique key identities before declaring a public-key hash absent', () => {
    state.q = 'f'.repeat(40);
    state.nonUnique.data = ['GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'];
    render(<SearchPage />);
    expect(screen.getByRole('link', { name: `Open Identities by non-unique public-key hash ${state.q} on testnet` })).toBeInTheDocument();
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
  });

  it('waits for the non-unique fallback and preserves its failures', () => {
    state.q = 'f'.repeat(40);
    state.nonUnique.isLoading = true;
    state.nonUnique.isSuccess = false;
    const view = render(<SearchPage />);
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
    state.nonUnique.isLoading = false;
    state.nonUnique.isError = true;
    state.nonUnique.error = new Error('Fallback timeout');
    view.rerender(<SearchPage />);
    expect(screen.getByText(/non-unique public-key hash: Fallback timeout/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.nonUnique.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText('No matching entity found')).not.toBeInTheDocument();
  });
});
