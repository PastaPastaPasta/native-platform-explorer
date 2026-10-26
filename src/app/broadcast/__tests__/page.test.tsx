import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import BroadcastPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
vi.mock('@components/broadcast/SignerStatusCard', () => ({ SignerStatusCard: () => null }));

describe('broadcast operation picker', () => {
  it('marks operations that cannot be signed here before they are opened', () => {
    renderWithProviders(<BroadcastPage />);
    const row = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
    expect(within(row('Broadcast a raw state transition')).getByText('Unavailable')).toBeVisible();
    expect(within(row('Cast a vote')).getByText('Unavailable')).toBeVisible();
    expect(within(row('Top up an identity')).getByText('Bridge')).toBeVisible();
    expect(within(row('Transfer credits')).queryByText(/Unavailable|Bridge/)).toBeNull();
    expect(
      within(row('Update a data contract')).getByText(
        'Edit the document schemas and definitions of a contract you own.',
      ),
    ).toBeVisible();
  });
});
