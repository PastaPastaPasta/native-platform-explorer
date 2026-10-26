import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ContractCacheSettings } from '../ContractCacheSettings';

describe('ContractCacheSettings', () => {
  it('removes the SDK\'s persisted contracts for mainnet and testnet, then reconnects', () => {
    localStorage.setItem('dash-sdk.contracts.mainnet', JSON.stringify({ a: { version: 1, bytes: '' } }));
    localStorage.setItem('dash-sdk.contracts.testnet', JSON.stringify({ b: { version: 2, bytes: '' }, c: { version: 1, bytes: '' } }));
    localStorage.setItem('dash-sdk.protocol-version.testnet', '14');
    const reconnect = vi.fn();
    renderWithProviders(<ContractCacheSettings />, { sdk: { reconnect } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear cached contracts' }));
    expect(localStorage.getItem('dash-sdk.contracts.mainnet')).toBeNull();
    expect(localStorage.getItem('dash-sdk.contracts.testnet')).toBeNull();
    expect(localStorage.getItem('dash-sdk.protocol-version.testnet')).toBe('14');
    expect(reconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Cleared 3 cached contracts and reconnected.');
  });
});
