import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { SdkSessionError } from '@sdk/errors';
import { createCustomDevnetConfig, removeCustomDevnet, saveCustomDevnet } from '@sdk/networks';
import { SdkSessionNotice, SdkVersionNotice } from '../SdkNotices';

// The newest protocol the bundled SDK supports; nothing else is read from the module.
vi.mock('@dashevo/evo-sdk', () => ({ EvoSDK: { getLatestVersionNumber: async () => 14 } }));

const status = (current: number) => ({ toJSON: () => ({ version: { protocol: { drive: { current, latest: current } } } }) });

describe('SdkSessionNotice', () => {
  it('renders a page-level unreachable state with retry and alternate endpoints', () => {
    const reconnect = vi.fn();
    renderWithProviders(<SdkSessionNotice />, { sdk: {
      sdk: null, status: 'error', reconnect,
      error: new SdkSessionError('unreachable', 'Failed to prefetch quorums: HTTP request error'),
    } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach Dash Platform (Testnet)');
    expect(alert).toHaveTextContent('Failed to prefetch quorums');
    expect(screen.getByRole('link', { name: 'Try alternate endpoints' })).toHaveAttribute('href', expect.stringMatching(/^\/settings\/?#connection$/));
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('labels startup timeouts and unknown networks', () => {
    const view = renderWithProviders(<SdkSessionNotice />, { sdk: { sdk: null, status: 'error', error: new SdkSessionError('timeout', 'Timed out after 20 s') } });
    expect(screen.getByRole('alert')).toHaveTextContent('Dash Platform did not respond');
    view.unmount();
    renderWithProviders(<SdkSessionNotice />, { sdk: { sdk: null, status: 'error', error: new SdkSessionError('unknown-network', 'Unknown network "x"') } });
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown network');
    expect(screen.queryByRole('button', { name: 'Retry connection' })).not.toBeInTheDocument();
  });

  it('explains that an address-only saved devnet now needs its quorum service', () => {
    saveCustomDevnet(createCustomDevnetConfig({ name: 'devnet-oldnet', dapiAddresses: ['https://10.0.0.1:1443'] }));
    const view = renderWithProviders(<SdkSessionNotice />, { sdk: {
      sdk: null, status: 'error', network: 'devnet-oldnet',
      error: new SdkSessionError('unreachable', 'Failed to prefetch quorums: HTTP request error'),
    } });
    expect(screen.getByRole('alert')).toHaveTextContent('The explorer used the default, https://quorums.oldnet.networks.dash.org');
    view.unmount();
    saveCustomDevnet(createCustomDevnetConfig({ name: 'devnet-newnet', quorumUrl: 'https://quorums.example.test' }));
    renderWithProviders(<SdkSessionNotice />, { sdk: {
      sdk: null, status: 'error', network: 'devnet-newnet',
      error: new SdkSessionError('unreachable', 'Failed to prefetch quorums: HTTP request error'),
    } });
    expect(screen.getByRole('alert')).not.toHaveTextContent('no quorum service URL saved');
    removeCustomDevnet('devnet-newnet');
  });

  it('keeps the devnet quorum hint to failed connects and names underivable defaults', () => {
    saveCustomDevnet(createCustomDevnetConfig({ name: 'devnet-oldnet', dapiAddresses: ['https://10.0.0.1:1443'] }));
    // A ready session already prefetched from the derived service.
    const view = renderWithProviders(<SdkSessionNotice />, { sdk: {
      network: 'devnet-oldnet', unreachable: new SdkSessionError('unreachable', 'No DAPI endpoint answered: no available addresses to retry'),
    } });
    expect(screen.getByRole('alert')).not.toHaveTextContent('no quorum service URL saved');
    view.unmount();
    removeCustomDevnet('devnet-oldnet');
    saveCustomDevnet(createCustomDevnetConfig({ name: 'devnet-mainnet', dapiAddresses: ['https://10.0.0.1:1443'] }));
    renderWithProviders(<SdkSessionNotice />, { sdk: {
      sdk: null, status: 'error', network: 'devnet-mainnet',
      error: new SdkSessionError('unreachable', 'Devnet name \'mainnet\' is reserved'),
    } });
    expect(screen.getByRole('alert')).toHaveTextContent('No default can be derived from its name ("mainnet" is reserved)');
    expect(screen.getByRole('alert')).not.toHaveTextContent('quorums.mainnet.networks.dash.org');
    removeCustomDevnet('devnet-mainnet');
  });

  it('shows the unreachable state over a ready session whose endpoints all failed', () => {
    renderWithProviders(<SdkSessionNotice />, { sdk: { unreachable: new SdkSessionError('unreachable', 'No DAPI endpoint answered: no available addresses to retry') } });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach Dash Platform');
    expect(screen.getByRole('alert')).toHaveTextContent('no available addresses to retry');
  });

  it('explains an offline browser and reconnects when the connection returns', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const reconnect = vi.fn();
    renderWithProviders(<SdkSessionNotice />, { sdk: {
      sdk: null, status: 'error', reconnect,
      error: new SdkSessionError('unreachable', 'Failed to prefetch quorums: HTTP request error'),
    } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('You are offline');
    expect(alert).toHaveTextContent('Pages it has saved still work');
    expect(alert).not.toHaveTextContent('Cannot reach Dash Platform');
    expect(reconnect).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach Dash Platform (Testnet)');
    expect(reconnect).toHaveBeenCalledOnce();
    online.mockRestore();
  });

  it('renders nothing for healthy or connecting sessions', () => {
    renderWithProviders(<SdkSessionNotice />, { sdk: { status: 'connecting', sdk: null } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SdkVersionNotice', () => {
  it('warns when the network runs a protocol newer than the SDK supports and can be dismissed', async () => {
    // The session ratchets no higher than the newest version it supports.
    const sdk = createMockSdk({ version: vi.fn().mockReturnValue(14), system: { status: vi.fn().mockResolvedValue(status(15)) } });
    renderWithProviders(<SdkVersionNotice />, { sdk: { sdk } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Testnet runs Platform protocol v15'));
    expect(screen.getByRole('status')).toHaveTextContent('supports up to v14');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss protocol version warning' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('npe:protocolWarningDismissed')).toBe('testnet:network-newer:14:15');
  });

  it('warns when the network runs a protocol older than the session uses', async () => {
    // A devnet session starts at v14 and cannot step down to a v13 devnet.
    const sdk = createMockSdk({ version: vi.fn().mockReturnValue(14), system: { status: vi.fn().mockResolvedValue(status(13)) } });
    renderWithProviders(<SdkVersionNotice />, { sdk: { sdk } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Testnet runs Platform protocol v13, older than the v14 this SDK session uses'));
    expect(screen.getByRole('status')).toHaveTextContent('writes are disabled');
    expect(screen.getByRole('link', { name: 'clear the SDK cache' })).toHaveAttribute('href', expect.stringMatching(/^\/settings\/?#connection$/));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss protocol version warning' }));
    expect(window.sessionStorage.getItem('npe:protocolWarningDismissed')).toBe('testnet:network-older:14:13');
  });

  it.each([14, 13])('stays silent when the network runs v%s, which the SDK supports', async (current) => {
    const statusFn = vi.fn().mockResolvedValue(status(current));
    // Before its first proved answer a 5.0 session reports the network floor (13).
    const sdk = createMockSdk({ version: vi.fn().mockReturnValue(13), system: { status: statusFn } });
    renderWithProviders(<SdkVersionNotice />, { sdk: { sdk } });
    await waitFor(() => expect(statusFn).toHaveBeenCalled());
    // Let the supported-version lookup settle before asserting silence.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
