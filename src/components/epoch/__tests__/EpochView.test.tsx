import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EpochView } from '../EpochView';
import { renderWithProviders } from '@/test/render';
import { WalkedMap } from '@util/paged-walk';

const q = (over: Record<string, unknown>) => ({ isLoading: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...over });

describe('EpochView proposer totals', () => {
  it('hides totals while the walk is disabled by a failed epoch lookup', () => {
    renderWithProviders(<EpochView epoch={null} epochQ={q({ isError: true, error: new Error('epoch down') })}
      evonodesQ={q({})} leaderboardTitle="Top proposers this epoch" leaderboardLimit={20} />);
    expect(screen.queryByText(/blocks ·/)).not.toBeInTheDocument();
    // The disabled walk is not an empty epoch.
    expect(screen.queryByText('No proposers yet this epoch.')).not.toBeInTheDocument();
    expect(screen.getByText('Proposers cannot be listed without the current epoch.')).toBeVisible();
  });

  it('shows totals over every proposer once the walk returns', () => {
    const data = new Map([['a'.repeat(64), 3], ['b'.repeat(64), 2]]);
    renderWithProviders(<EpochView epoch={null} epochQ={q({})} evonodesQ={q({ data })}
      leaderboardTitle="Top proposers this epoch" leaderboardLimit={1} />);
    expect(screen.getByText(/5 blocks · 2 evonodes/)).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns when the walk stopped at its page cap', () => {
    const data = Object.assign(new WalkedMap([['a'.repeat(64), 3]]), { truncated: true });
    renderWithProviders(<EpochView epoch={null} epochQ={q({})} evonodesQ={q({ data })}
      leaderboardTitle="Top proposers this epoch" leaderboardLimit={20} />);
    expect(screen.getByRole('status')).toHaveTextContent('Results may be incomplete: reading proposers stopped at the page limit.');
  });
});
