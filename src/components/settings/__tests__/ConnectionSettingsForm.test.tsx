import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { defaultConnectionSettings } from '@sdk/connection-settings';
import { ConnectionSettingsForm } from '../ConnectionSettingsForm';

describe('ConnectionSettingsForm', () => {
  it('saves validated settings and leaves blank fields at SDK defaults', () => {
    const setConnectionSettings = vi.fn();
    renderWithProviders(<ConnectionSettingsForm />, { sdk: { setConnectionSettings } });
    fireEvent.change(screen.getByLabelText('Testnet quorum service URL'), { target: { value: 'https://quorums.example.test/' } });
    fireEvent.change(screen.getByLabelText('Request timeout (ms)'), { target: { value: '8000' } });
    fireEvent.change(screen.getByLabelText('Ban failed DAPI addresses'), { target: { value: 'off' } });
    fireEvent.change(screen.getByLabelText('SDK log level'), { target: { value: 'debug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & reconnect' }));
    expect(setConnectionSettings).toHaveBeenCalledWith({
      ...defaultConnectionSettings(),
      requestTimeoutMs: 8000,
      banFailedAddress: false,
      logLevel: 'debug',
      quorumUrls: { mainnet: null, testnet: 'https://quorums.example.test' },
    });
  });

  it('rejects out-of-range numbers and non-HTTPS quorum services without saving', () => {
    const setConnectionSettings = vi.fn();
    renderWithProviders(<ConnectionSettingsForm />, { sdk: { setConnectionSettings } });
    fireEvent.change(screen.getByLabelText('Retries'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Mainnet quorum service URL'), { target: { value: 'http://quorums.example.test' } });
    fireEvent.change(screen.getByLabelText('Startup timeout (ms)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & reconnect' }));
    expect(setConnectionSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Whole number from 0 to 20.')).toBeInTheDocument();
    expect(screen.getByText(/Use https:\/\//)).toBeInTheDocument();
    expect(screen.getByText('Required.')).toBeInTheDocument();
  });

  it('labels only accepted build-time quorum URLs as the build default', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_MAINNET', 'http://quorums.example.test');
    vi.stubEnv('NEXT_PUBLIC_QUORUM_URL_TESTNET', 'https://quorums.build.test');
    renderWithProviders(<ConnectionSettingsForm />);
    const mainnet = screen.getByLabelText('Mainnet quorum service URL');
    const testnet = screen.getByLabelText('Testnet quorum service URL');
    expect(mainnet).toHaveAttribute('placeholder', 'https://quorums.mainnet.networks.dash.org');
    expect(testnet).toHaveAttribute('placeholder', 'https://quorums.build.test');
    expect(screen.getAllByText(/Build default shown/)).toHaveLength(1);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('resets to defaults', () => {
    const setConnectionSettings = vi.fn();
    renderWithProviders(<ConnectionSettingsForm />, { sdk: { setConnectionSettings, connectionSettings: { ...defaultConnectionSettings(), retries: 4 } } });
    expect(screen.getByLabelText('Retries')).toHaveValue('4');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(setConnectionSettings).toHaveBeenCalledWith(defaultConnectionSettings());
    expect(screen.getByLabelText('Retries')).toHaveValue('');
  });
});
