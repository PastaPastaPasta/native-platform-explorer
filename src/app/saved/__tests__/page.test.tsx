import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SavedPage from '../page';
import { getSavedEntities, saveEntity } from '@util/exploration';

vi.mock('@sdk/hooks', () => ({ useSdk: () => ({ network: 'testnet' }) }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));

const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

describe('saved collection page', () => {
  it('filters by network, opens the saved context, and supports removal and clearing', () => {
    saveEntity({ kind: 'identity', id, network: 'testnet' });
    saveEntity({ kind: 'contract', id, network: 'mainnet' });
    render(<SavedPage />);
    expect(screen.getAllByRole('link', { name: /^Open / })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Network scope'), { target: { value: 'all' } });
    const contract = screen.getByRole('link', { name: `Open contract ${id} on mainnet` });
    expect(contract.getAttribute('href')).toMatch(/\/contract\/?\?id=.+&network=mainnet/);
    fireEvent.change(screen.getByLabelText('Entity type'), { target: { value: 'contract' } });
    expect(screen.getAllByRole('link', { name: /^Open / })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: `Remove contract ${id} on mainnet` }));
    expect(getSavedEntities()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('No saved items');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved items' }));
    expect(getSavedEntities()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Clear all saved items' })).toBeDisabled();
  });

  it('requires custom network configuration before opening an unknown saved network', () => {
    saveEntity({ kind: 'token', id, network: 'devnet-custom' });
    render(<SavedPage />);
    fireEvent.change(screen.getByLabelText('Network scope'), { target: { value: 'all' } });
    expect(screen.getByText(/Configure this custom devnet/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Open / })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });
});
