import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EpochView } from '../EpochView';
import { renderWithProviders } from '@/test/render';

const q = (over: Record<string, unknown>) => ({ isLoading: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...over });

describe('EpochView proposer totals', () => {
  it('hides totals while the walk is disabled by a failed epoch lookup', () => {
    renderWithProviders(<EpochView epoch={null} epochQ={q({ isError: true, error: new Error('epoch down') })}
      evonodesQ={q({})} leaderboardTitle="Top proposers this epoch" leaderboardLimit={20} />);
    expect(screen.queryByText(/blocks ·/)).not.toBeInTheDocument();
  });

  it('shows totals over every proposer once the walk returns', () => {
    const data = new Map([['a'.repeat(64), 3], ['b'.repeat(64), 2]]);
    renderWithProviders(<EpochView epoch={null} epochQ={q({})} evonodesQ={q({ data })}
      leaderboardTitle="Top proposers this epoch" leaderboardLimit={1} />);
    expect(screen.getByText(/5 blocks · 2 evonodes/)).toBeVisible();
  });
});
