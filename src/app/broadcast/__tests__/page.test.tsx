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
  it('marks operations signed with keys from the form before they are opened', () => {
    renderWithProviders(<BroadcastPage />);
    const row = (label: string) => screen.getByText(label, { exact: true }).closest('button')!;
    for (const label of [
      'Broadcast a signed state transition',
      'Cast a masternode vote',
      'Top up an identity',
      'Create an identity',
      'Send between addresses',
      'Withdraw from an address',
    ])
      expect(within(row(label)).getByText('Keys in form')).toBeVisible();
    expect(within(row('Transfer credits')).queryByText(/Keys in form|Unavailable/)).toBeNull();
    expect(
      within(row('Fund addresses from your identity')).queryByText(/Keys in form|Unavailable/),
    ).toBeNull();
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(
      within(row('Update a data contract')).getByText(
        'Edit the document schemas and definitions of a contract you own.',
      ),
    ).toBeVisible();
  });
});
