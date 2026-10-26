import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WellKnownRegistrySettings } from '../WellKnownRegistrySettings';
import { resetWellKnownRegistryForTests } from '@hooks/useWellKnownRegistry';
import { LOCAL_REGISTRY_KEY } from '@util/well-known-registry';

const OTHER = 'Gz1ayo3EKKZTZrcgiqsoaAVMXaZUrv48YFzBVhP5jtJ6';

beforeEach(() => resetWellKnownRegistryForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function entryRow(name: string): HTMLElement {
  return screen.getByText(name, { selector: 'p' }).closest('div[class*="stack"]')!.parentElement!;
}

describe('well-known registry settings', () => {
  it('lists bundled entries with their source and network', () => {
    renderWithProviders(<WellKnownRegistrySettings />);
    expect(screen.getByText(/No remote registry is configured/)).toBeInTheDocument();
    const dusd = entryRow('DUSD');
    expect(within(dusd).getByText('bundled')).toBeInTheDocument();
    expect(within(dusd).getByText('mainnet')).toBeInTheDocument();
  });

  it('adds and removes a local entry, stored in this browser', () => {
    renderWithProviders(<WellKnownRegistrySettings />);
    fireEvent.change(screen.getByLabelText('Identifier'), { target: { value: OTHER } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hack the planet' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'groups, Demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add local entry' }));
    const row = entryRow('Hack the planet');
    expect(within(row).getByText('local')).toBeInTheDocument();
    expect(within(row).getByText('testnet')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LOCAL_REGISTRY_KEY)!)).toEqual([
      { id: OTHER, kind: 'identity', name: 'Hack the planet', tags: ['groups', 'demo'], network: 'testnet' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove local entry Hack the planet' }));
    expect(screen.queryByText('Hack the planet')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(LOCAL_REGISTRY_KEY)).toBeNull();
  });

  it('keeps a local entry that a bundled entry shadows visible and removable', () => {
    window.localStorage.setItem(LOCAL_REGISTRY_KEY, JSON.stringify([
      { id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', kind: 'contract', name: 'My DPNS', network: 'testnet' },
    ]));
    renderWithProviders(<WellKnownRegistrySettings />);
    expect(screen.getByText(/not used: the bundled entry “DPNS” names this ID/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove local entry My DPNS' }));
    expect(window.localStorage.getItem(LOCAL_REGISTRY_KEY)).toBeNull();
  });

  it('explains why an entry was refused', () => {
    renderWithProviders(<WellKnownRegistrySettings />);
    fireEvent.change(screen.getByLabelText('Identifier'), { target: { value: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add local entry' }));
    expect(screen.getByText(/already in the registry as "DPNS" \(bundled\)/)).toBeInTheDocument();
  });

  it('merges a remote registry and shows a visible note when it fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_WELL_KNOWN_URL', 'https://registry.example/wk.json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 1, entries: [{ id: OTHER, kind: 'identity', name: 'Remote team', network: 'testnet' }],
    }))));
    const view = renderWithProviders(<WellKnownRegistrySettings />);
    await act(async () => {});
    expect(screen.getByText(/Remote registry: 1 entry from https:\/\/registry.example\/wk.json/)).toBeInTheDocument();
    expect(within(entryRow('Remote team')).getByText('remote')).toBeInTheDocument();
    view.unmount();

    resetWellKnownRegistryForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"version":1,"entries":[{"id":"bad"}]}')));
    renderWithProviders(<WellKnownRegistrySettings />);
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(/was not loaded, so only bundled and local entries are shown: entries\[0\]\.id/);
  });
});
