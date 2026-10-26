import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';
import { renderWithProviders } from '@/test/render';
import { WalkedMap } from '@util/paged-walk';

const hash = (n: number) => n.toString(16).padStart(64, '0');
const base = { refetch: vi.fn(), proofState: { kind: 'unverified-trusted-off' } };
const ok = (data: unknown) => ({ ...base, data, status: 'success', isSuccess: true, isLoading: false, isError: false, error: null });
const loading = { ...base, data: undefined, status: 'pending', isSuccess: false, isLoading: true, isError: false, error: null };
const failed = (message: string) => ({ ...base, data: undefined, status: 'error', isSuccess: false, isLoading: false, isError: true, error: new Error(message) });

const state = vi.hoisted(() => ({ hooks: {} as Record<string, unknown> }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: () => {} }));
vi.mock('@sdk/queries', () => Object.fromEntries([
  'useSystemStatus', 'useCurrentEpoch', 'useTotalCreditsInPlatform', 'useCurrentQuorumsInfo',
  'useAllEvonodeBlocksInEpoch', 'useAllProtocolVotes', 'useVotePollsByEndDate', 'useDashUsdRate',
  // Not used by the home page; mocked so a regression to it would render v12.
  'useProtocolVersionUpgradeState',
].map((name) => [name, () => state.hooks[name]])));

function protocolCell(): HTMLElement {
  return screen.getByText('Protocol version').parentElement!;
}

beforeEach(() => {
  state.hooks = {
    useSystemStatus: ok({}),
    useCurrentEpoch: ok({ index: 86, protocolVersion: 11, firstBlockTime: 1 }),
    useTotalCreditsInPlatform: ok(1n),
    useCurrentQuorumsInfo: ok({ quorums: [] }),
    useAllEvonodeBlocksInEpoch: ok(new Map()),
    useAllProtocolVotes: ok(new Map([[hash(1), 12], [hash(2), 12], [hash(3), 11]])),
    useVotePollsByEndDate: ok([]),
    useDashUsdRate: ok(null),
    useProtocolVersionUpgradeState: ok({ currentProtocolVersion: 12, nextProtocolVersion: undefined }),
  };
});

describe('home protocol cell', () => {
  it('shows the epoch’s version and the pending upgrade from the votes', () => {
    renderWithProviders(<HomePage />);
    expect(protocolCell()).toHaveTextContent('v11');
    expect(protocolCell()).toHaveTextContent('2 votes for v12');
    expect(protocolCell()).not.toHaveTextContent('no votes above');
  });

  it('never shows the SDK’s built-in version while the epoch loads', () => {
    state.hooks.useCurrentEpoch = loading;
    renderWithProviders(<HomePage />);
    expect(protocolCell()).not.toHaveTextContent('v12');
    expect(protocolCell()).not.toHaveTextContent('pending');
  });

  it('shows an error, not the SDK’s version, when the epoch is unavailable (devnet)', () => {
    state.hooks.useCurrentEpoch = failed('this network has no verified epoch duration');
    renderWithProviders(<HomePage />);
    expect(protocolCell()).toHaveTextContent('error');
    expect(protocolCell()).not.toHaveTextContent('v12');
    // The proposer walk is disabled without an epoch; that is not an empty epoch.
    expect(screen.getByText(/Proposers unavailable: the current epoch is unknown/)).toBeVisible();
    expect(screen.queryByText('No proposers yet this epoch.')).toBeNull();
  });

  it('warns when the proposer walk stopped at its page cap', () => {
    state.hooks.useAllEvonodeBlocksInEpoch = ok(Object.assign(new WalkedMap([[hash(1), 3]]), { truncated: true }));
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('status')).toHaveTextContent('Results may be incomplete');
  });

  it('does not claim an upgrade before the votes load', () => {
    state.hooks.useAllProtocolVotes = loading;
    renderWithProviders(<HomePage />);
    expect(protocolCell()).toHaveTextContent('reading upgrade votes…');
  });

  it('states that no newer version has votes when none does', () => {
    state.hooks.useAllProtocolVotes = ok(new Map([[hash(1), 11]]));
    renderWithProviders(<HomePage />);
    expect(protocolCell()).toHaveTextContent('no votes above v11');
  });
});
