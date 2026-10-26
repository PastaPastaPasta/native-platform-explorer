import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { SdkSessionError } from '@sdk/errors';
import { networkProtocolVersion } from '@sdk/version';
import { SdkSessionNotice, SdkVersionNotice } from '../SdkNotices';

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

  it('shows the unreachable state over a ready session whose endpoints all failed', () => {
    renderWithProviders(<SdkSessionNotice />, { sdk: { unreachable: new SdkSessionError('unreachable', 'No DAPI endpoint answered: no available addresses to retry') } });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach Dash Platform');
    expect(screen.getByRole('alert')).toHaveTextContent('no available addresses to retry');
  });

  it('renders nothing for healthy or connecting sessions', () => {
    renderWithProviders(<SdkSessionNotice />, { sdk: { status: 'connecting', sdk: null } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SdkVersionNotice', () => {
  it('reads the network protocol version from system.status', () => {
    expect(networkProtocolVersion(status(14))).toBe(14);
    expect(networkProtocolVersion({ chain: {} })).toBeNull();
    expect(networkProtocolVersion(undefined)).toBeNull();
  });

  it('warns when the network protocol differs from the SDK protocol and can be dismissed', async () => {
    const sdk = createMockSdk({ version: vi.fn().mockReturnValue(12), system: { status: vi.fn().mockResolvedValue(status(14)) } });
    renderWithProviders(<SdkVersionNotice />, { sdk: { sdk } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Testnet runs Platform protocol v14'));
    expect(screen.getByRole('status')).toHaveTextContent('speaks v12');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss protocol version warning' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('npe:protocolWarningDismissed')).toBe('testnet:12:14');
  });

  it('stays silent when versions match', async () => {
    const statusFn = vi.fn().mockResolvedValue(status(12));
    const sdk = createMockSdk({ version: vi.fn().mockReturnValue(12), system: { status: statusFn } });
    renderWithProviders(<SdkVersionNotice />, { sdk: { sdk } });
    await waitFor(() => expect(statusFn).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
