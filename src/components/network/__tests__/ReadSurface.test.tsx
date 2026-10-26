import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvonodePage from '@/app/evonode/page';
import ProtocolPage from '@/app/network/protocol/page';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { QuorumsTable } from '@components/network/QuorumsTable';
import { renderWithProviders } from '@/test/render';
import { proTxHashToBase58 } from '@util/protx';

const hash = (n: number) => n.toString(16).padStart(64, '0');
const status = (version: number) => Object.create({ version, proTxHash: { __type: 'ProTxHash' } }) as object;
const ok = (data: unknown) => ({ data, status: 'success', isSuccess: true, isLoading: false, isError: false, error: null, refetch: vi.fn() });

const state = vi.hoisted(() => ({
  params: '',
  hooks: {} as Record<string, unknown>,
  calls: {} as Record<string, unknown[][]>,
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.params),
  useRouter: () => ({ push: state.push }),
}));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: () => {} }));
vi.mock('@sdk/queries', () => {
  const hook = (name: string) => (...args: unknown[]) => {
    (state.calls[name] ??= []).push(args);
    return state.hooks[name];
  };
  return Object.fromEntries([
    'useCurrentEpoch', 'useAllEvonodeBlocksInEpoch', 'useEvonodesBlocksByIds', 'useFinalizedEpochInfo',
    'useProtocolVersionUpgradeVoteStatus', 'useProtocolVersionUpgradeState', 'useAllProtocolVotes',
  ].map((name) => [name, hook(name)]));
});

beforeEach(() => {
  state.calls = {};
  state.push.mockClear();
  state.hooks = {
    useCurrentEpoch: ok({ index: 86, protocolVersion: 13, firstBlockTime: 1_792_598_042_047 }),
    useAllEvonodeBlocksInEpoch: ok(new Map([[hash(1), 11], [hash(2), 10], [hash(3), 4]])),
    useEvonodesBlocksByIds: ok(new Map([[hash(2), 10n]])),
    useFinalizedEpochInfo: ok(new Map([[85, { blockProposers: new Map([[proTxHashToBase58(hash(2))!, 5n], [proTxHashToBase58(hash(9))!, 7n]]) }]])),
    useProtocolVersionUpgradeVoteStatus: ok(new Map([[hash(2), status(13)]])),
    useProtocolVersionUpgradeState: ok({ currentProtocolVersion: 12, nextProtocolVersion: 13 }),
    useAllProtocolVotes: ok(new Map([[hash(1), 13], [hash(2), 13], [hash(3), 12]])),
  };
});

describe('evonode page', () => {
  it('offers a lookup and the leaderboard instead of a dead end without a proTxHash', () => {
    state.params = '';
    renderWithProviders(<EvonodePage />);
    expect(screen.getByRole('link', { name: /Current epoch leaderboard/ })).toHaveAttribute('href', '/epoch');
    const input = screen.getByPlaceholderText('64-character hex proTxHash');
    fireEvent.change(input, { target: { value: proTxHashToBase58(hash(2)) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.push).toHaveBeenCalledWith(`/evonode/?proTxHash=${hash(2)}`);
  });

  it('looks up its own vote directly and renders the version, not a WASM object', () => {
    state.params = `proTxHash=${hash(2)}`;
    renderWithProviders(<EvonodePage />);
    expect(state.calls.useProtocolVersionUpgradeVoteStatus?.[0]).toEqual([hash(2), 1]);
    expect(screen.getByText('v13')).toBeVisible();
    expect(screen.getByText('current version')).toBeVisible();
    expect(document.body.textContent).not.toContain('__type');
    // Rank and share come from the complete walk; the count from the by-id query.
    expect(screen.getByText('#2')).toBeVisible();
    expect(screen.getByText('(10/25)')).toBeVisible();
    expect(state.calls.useEvonodesBlocksByIds?.at(-1)).toEqual([86, [hash(2)]]);
  });

  it('does not attribute the next masternode’s vote to a node without one', () => {
    state.params = `proTxHash=${hash(2)}`;
    state.hooks.useProtocolVersionUpgradeVoteStatus = ok(new Map([[hash(3), status(12)]]));
    renderWithProviders(<EvonodePage />);
    expect(screen.getByText('No protocol version vote is recorded for this proTxHash.')).toBeVisible();
  });

  it('reads earlier epochs from the finalized record (base58 keys)', () => {
    state.params = `proTxHash=${proTxHashToBase58(hash(2))}`;
    renderWithProviders(<EvonodePage />);
    fireEvent.change(screen.getByLabelText('Epoch'), { target: { value: '85' } });
    expect(state.calls.useFinalizedEpochInfo?.at(-1)).toEqual([85]);
    expect(state.calls.useEvonodesBlocksByIds?.at(-1)).toEqual([undefined, [hash(2)]]);
    expect(screen.getByText('(5/12)')).toBeVisible();
  });
});

describe('protocol page', () => {
  it('tallies every vote and counts known evonodes without one', () => {
    renderWithProviders(<ProtocolPage />);
    // 3 voters + proposer hash(9) from finalized epoch #85 = 4 known evonodes.
    expect(screen.getByText(/Denominator: 4 known evonodes/)).toBeVisible();
    expect(screen.getByText('no vote yet:')).toBeVisible();
    expect(screen.getByText('v13 (current):')).toBeVisible();
    // The SDK's stale currentProtocolVersion is reported, not displayed as current.
    expect(screen.getByText(/reports currentProtocolVersion v12/)).toBeVisible();
    expect(screen.getByText('none pending')).toBeVisible();
    expect(screen.getByText(`proTxHash (3)`)).toBeVisible();
  });
});

describe('EvonodesLeaderboard', () => {
  it('states totals across every proposer, not just the rows shown', () => {
    const entries = [{ proTxHash: hash(1), blocks: 9 }, { proTxHash: hash(2), blocks: 5 }, { proTxHash: hash(3), blocks: 1 }];
    renderWithProviders(<EvonodesLeaderboard entries={entries} limit={2} />);
    expect(screen.getByText(/Top 2 of 3 proposers · 15 blocks proposed/)).toBeVisible();
  });
});

describe('QuorumsTable', () => {
  it('renders rows with the raw response behind a disclosure', () => {
    const data = { height: 9n, quorums: [{ quorumHash: hash(7), quorumType: 'LLMQ_100_67', memberCount: 99, threshold: 66, isVerified: true }] };
    renderWithProviders(<QuorumsTable data={data} />);
    // isVerified is hard-coded by the SDK, and type/threshold are inferred.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Quorum hash', 'Type*', 'Members', 'Threshold*']);
    expect(screen.getByText(/\* Type and threshold are inferred by the SDK from the member count/)).toBeVisible();
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByText('LLMQ_100_67')).toBeVisible();
    expect(within(row).getByText('99')).toBeVisible();
    expect(within(row).getByText('66')).toBeVisible();
    const toggle = screen.getByRole('button', { name: 'Show raw response' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide raw response' })).toHaveAttribute('aria-expanded', 'true');
  });
});
