import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '../../../test/render';
import { DiagnosticsDrawer } from '../DiagnosticsDrawer';

vi.mock('@sdk/hooks', () => ({ useSdk: () => ({ network: 'testnet', trusted: true, status: 'ready' }) }));

describe('DiagnosticsDrawer shortcut preference', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens by default', () => {
    renderWithProviders(<DiagnosticsDrawer />);
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('does not open after Settings disables it', () => {
    localStorage.setItem('npe:diagnosticsEnabled', 'false');
    renderWithProviders(<DiagnosticsDrawer />);
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
  });

  it('records query updates only while the settings preference is enabled', async () => {
    localStorage.setItem('npe:diagnosticsEnabled', 'false');
    const queryClient = createTestQueryClient();
    renderWithProviders(<DiagnosticsDrawer />, { queryClient });
    await act(async () => { queryClient.setQueryData(['disabled-fixture'], true); });
    localStorage.setItem('npe:diagnosticsEnabled', 'true');
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.queryByText('["disabled-fixture"]')).not.toBeInTheDocument();
    await act(async () => { queryClient.setQueryData(['enabled-fixture'], true); });
    expect(screen.getAllByText('["enabled-fixture"]').length).toBeGreaterThan(0);
    localStorage.setItem('npe:diagnosticsEnabled', 'false');
    await act(async () => { queryClient.setQueryData(['disabled-again-fixture'], true); });
    expect(screen.queryByText('["disabled-again-fixture"]')).not.toBeInTheDocument();
  });

  it('keeps queries usable when the diagnostics preference cannot be read', async () => {
    const read = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'npe:diagnosticsEnabled') throw new Error('Storage denied');
      return read(key);
    });
    const queryClient = createTestQueryClient();
    renderWithProviders(<DiagnosticsDrawer />, { queryClient });
    await act(async () => { queryClient.setQueryData(['storage-unavailable'], true); });
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });
});
