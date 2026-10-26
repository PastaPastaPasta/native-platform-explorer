import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { ShieldedPoolView } from '../ShieldedPoolView';

vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: () => {} }));

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const note = (i: number) => Object.create({ cmx: bytes(i), nullifier: bytes(200 + (i % 50)), cvNet: bytes(3), encryptedNote: new Uint8Array(216) });

function shielded(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    poolState: vi.fn().mockResolvedValue(902974021321110n),
    mostRecentAnchor: vi.fn().mockResolvedValue(bytes(0xfb)),
    anchors: vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => bytes(i + 1))),
    nullifiers: vi.fn(async (list: Uint8Array[]) => list.map((n) => Object.create({ nullifier: n, isSpent: n[0] === 0xaa }))),
    encryptedNotes: vi.fn().mockResolvedValue(Array.from({ length: 30 }, (_, i) => note(i))),
    ...overrides,
  };
  for (const key of Object.keys(base)) {
    const fn = base[key] as (...a: unknown[]) => Promise<unknown>;
    base[`${key}WithProof`] = vi.fn(async (...a: unknown[]) => ({ data: await fn(...a) }));
  }
  return base;
}

describe('ShieldedPoolView', () => {
  it('shows pool state, anchors, nullifier lookups and a window of notes', async () => {
    const api = shielded();
    renderWithProviders(<ShieldedPoolView />, { sdk: { sdk: createMockSdk({ shielded: api }) } });
    expect(await screen.findByText('Valid anchors (12)')).toBeVisible();
    expect(screen.getByText('fb'.repeat(32))).toBeVisible();
    expect(screen.getByText('page 1')).toBeVisible();

    const textarea = screen.getByLabelText('Nullifiers to look up');
    fireEvent.change(textarea, { target: { value: `${'aa'.repeat(32)}, ${'bb'.repeat(32)}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Check 2 nullifiers' }));
    const statuses = await screen.findByRole('table', { name: 'Nullifier statuses' });
    expect(within(statuses).getByText('spent')).toBeVisible();
    expect(within(statuses).getByText('not spent')).toBeVisible();
    fireEvent.change(textarea, { target: { value: 'zz' } });
    expect(screen.getByText(/is not a 32-byte nullifier/)).toBeVisible();

    // Notes are only fetched on request, a whole aligned window at a time.
    expect(api.encryptedNotes).not.toHaveBeenCalled();
    expect(api.encryptedNotesWithProof).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load window' }));
    const table = await screen.findByRole('table', { name: 'Encrypted notes' });
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByText('30 notes in this window — the end of the tree.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next window' })).toBeDisabled();
    const calls = [...(api.encryptedNotes as ReturnType<typeof vi.fn>).mock.calls, ...(api.encryptedNotesWithProof as ReturnType<typeof vi.fn>).mock.calls];
    expect(calls[0]).toEqual([0n, 8192]);

    fireEvent.click(within(table).getAllByRole('button', { name: 'check' })[0]!);
    expect(textarea).toHaveValue('c8'.repeat(32));
  });

  it('renders honest empty states for a network with nothing shielded', async () => {
    renderWithProviders(<ShieldedPoolView />, { sdk: { sdk: createMockSdk({ shielded: shielded({
      poolState: vi.fn().mockResolvedValue(undefined),
      mostRecentAnchor: vi.fn().mockResolvedValue(undefined),
      anchors: vi.fn().mockResolvedValue([]),
      encryptedNotes: vi.fn().mockResolvedValue([]),
    }) }) } });
    expect(await screen.findByText('No pool state: nothing has been shielded on this network.')).toBeVisible();
    expect(await screen.findByText('No anchors yet: nothing has been shielded on this network.')).toBeVisible();
    expect(screen.getByText('None yet.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load window' }));
    expect(await screen.findByText('No notes yet: nothing has been shielded on this network.')).toBeVisible();
  });
});
