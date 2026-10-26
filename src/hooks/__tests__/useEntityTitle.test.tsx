import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { useContractTitle, useIdentityTitle, useTokenTitle } from '../useEntityTitle';

const ID = 'AFaVqRJCWXFZRUhuq6ZUUcWXVW8fErCN3wpEtgsBnDZm';
const UNKNOWN = 'Gz1ayo3EKKZTZrcgiqsoaAVMXaZUrv48YFzBVhP5jtJ6';

function Identity({ id }: { id?: string }) { useIdentityTitle(id); return null; }
function Contract({ id }: { id?: string }) { useContractTitle(id); return null; }
function Token({ id }: { id?: string }) { useTokenTitle(id); return null; }

afterEach(() => { document.title = ''; });

describe('entity titles', () => {
  it('uses a generic identity title, then the DPNS name once loaded', async () => {
    let resolve!: (names: string[]) => void;
    const usernames = vi.fn(() => new Promise<string[]>((r) => { resolve = r; }));
    renderWithProviders(<Identity id={UNKNOWN} />, {
      sdk: { sdk: createMockSdk({ dpns: { usernames, usernamesWithProof: vi.fn().mockRejectedValue(new Error('no capture')) } }) },
    });
    expect(document.title).toBe('Identity Gz1ayo…jtJ6 — Native Platform Explorer');
    await vi.waitFor(() => expect(usernames).toHaveBeenCalled());
    await act(async () => { resolve(['team-hack-the-planet.dash']); });
    await vi.waitFor(() => expect(document.title).toBe('team-hack-the-planet.dash — Native Platform Explorer'));
  });

  it('names well-known entities and falls back to a short ID', () => {
    const view = renderWithProviders(<Identity id={ID} />, { sdk: { sdk: createMockSdk({ dpns: { usernames: () => new Promise(() => {}) } }) } });
    expect(document.title).toBe('atlanta-degen-for-life.dash — Native Platform Explorer');
    view.unmount();
    renderWithProviders(<Contract id="GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec" />);
    expect(document.title).toBe('DPNS — Native Platform Explorer');
  });

  it('titles landing pages without an ID', () => {
    renderWithProviders(<Token />);
    expect(document.title).toBe('Tokens — Native Platform Explorer');
  });
});
