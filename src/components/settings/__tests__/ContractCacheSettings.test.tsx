import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ContractCacheSettings } from '../ContractCacheSettings';

describe('ContractCacheSettings', () => {
  it('removes the SDK\'s persisted contracts and protocol versions, then reconnects', () => {
    localStorage.setItem('dash-sdk.contracts.mainnet', JSON.stringify({ a: { version: 1, bytes: '' } }));
    localStorage.setItem('dash-sdk.contracts.testnet', JSON.stringify({ b: { version: 2, bytes: '' }, c: { version: 1, bytes: '' } }));
    localStorage.setItem('dash-sdk.protocol-version.testnet', '14');
    localStorage.setItem('npe:network', 'testnet');
    const reconnect = vi.fn();
    renderWithProviders(<ContractCacheSettings />, { sdk: { reconnect } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear SDK cache' }));
    expect(localStorage.getItem('dash-sdk.contracts.mainnet')).toBeNull();
    expect(localStorage.getItem('dash-sdk.contracts.testnet')).toBeNull();
    expect(localStorage.getItem('dash-sdk.protocol-version.testnet')).toBeNull();
    expect(localStorage.getItem('npe:network')).toBe('testnet');
    expect(reconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Cleared 3 cached contracts and the stored protocol versions; reconnecting.');
  });

  it('is disabled until the session is ready, when a reconnect would be ignored', () => {
    renderWithProviders(<ContractCacheSettings />, { sdk: { status: 'connecting', sdk: null } });
    expect(screen.getByRole('button', { name: 'Clear SDK cache' })).toBeDisabled();
  });
});
