import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvonodePage from '@/app/evonode/page';
import ProtocolPage from '@/app/network/protocol/page';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { QuorumsTable } from '@components/network/QuorumsTable';
import { renderWithProviders } from '@/test/render';
import { proTxHashToBase58 } from '@util/protx';
import { WalkedMap } from '@util/paged-walk';

const hash = (n: number) => n.toString(16).padStart(64, '0');
const status = (version: number) => Object.create({ version, proTxHash: { __type: 'ProTxHash' } }) as object;
const ok = (data: unknown) => ({ data, status: 'success', isSuccess: true, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const failed = (message: string) => ({ data: undefined, status: 'error', isSuccess: false, isLoading: false, isError: true, error: new Error(message), refetch: vi.fn() });
// A query its caller disabled: neither loading nor settled.
const idle = { data: undefined, status: 'pending', isSuccess: false, isLoading: false, isError: false, error: null, refetch: vi.fn() };
const truncated = <K, V>(entries: Array<[K, V]>) => Object.assign(new WalkedMap(entries), { truncated: true });

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
    expect(screen.getByText(/No protocol version vote is recorded for this proTxHash this epoch/)).toBeVisible();
  });

  it('takes count, rank and share from the walk so they cannot disagree', () => {
    state.params = `proTxHash=${hash(2)}`;
    // The by-id count is from another moment; the walk wins when it loaded.
    state.hooks.useEvonodesBlocksByIds = ok(new Map([[hash(2), 12n]]));
    renderWithProviders(<EvonodePage />);
    expect(screen.getByText('(10/25)')).toBeVisible();
    expect(screen.queryByText('12')).toBeNull();
  });

  it('falls back to the by-id count when the walk fails', () => {
    state.params = `proTxHash=${hash(2)}`;
    state.hooks.useAllEvonodeBlocksInEpoch = failed('walk failed');
    state.hooks.useEvonodesBlocksByIds = ok(new Map([[hash(2), 12n]]));
    renderWithProviders(<EvonodePage />);
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getAllByText('Ranking unavailable: walk failed')).toHaveLength(2);
  });

  it('says the vote is the current epoch’s when a past epoch is selected', () => {
    state.params = `proTxHash=${hash(2)}`;
    renderWithProviders(<EvonodePage />);
    expect(screen.queryByText(/so this is the vote recorded in epoch/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Epoch'), { target: { value: '85' } });
    expect(screen.getByText(/so this is the vote recorded in epoch #86, not #85/)).toBeVisible();
    expect(screen.getByText('current epoch #86')).toBeVisible();
  });

  it('styles a vote behind the current version unlike a current one', () => {
    state.params = `proTxHash=${hash(2)}`;
    renderWithProviders(<EvonodePage />);
    const currentClass = screen.getByText('current version').className;
    cleanup();
    state.hooks.useProtocolVersionUpgradeVoteStatus = ok(new Map([[hash(2), status(12)]]));
    renderWithProviders(<EvonodePage />);
    expect(screen.getByText('behind current v13').className).not.toBe(currentClass);
  });

  it('warns when the proposer walk stopped at its page cap', () => {
    state.params = `proTxHash=${hash(2)}`;
    state.hooks.useAllEvonodeBlocksInEpoch = ok(truncated([[hash(1), 11], [hash(2), 10]]));
    renderWithProviders(<EvonodePage />);
    expect(screen.getByRole('status')).toHaveTextContent('Results may be incomplete');
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
    // The SDK's nextProtocolVersion (13) is the current version here, not a pending one.
    expect(screen.getByText('none voted')).toBeVisible();
    expect(screen.getByText('no recorded vote above v13 this epoch')).toBeVisible();
    expect(screen.getByText(`proTxHash (3)`)).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reads the next version from the tally, not the SDK’s v12 basis', () => {
    // Network on v11 voting for v12: rc.2 reports no next version because it
    // compares against its own v12.
    state.hooks.useCurrentEpoch = ok({ index: 86, protocolVersion: 11, firstBlockTime: 1 });
    state.hooks.useProtocolVersionUpgradeState = ok({ currentProtocolVersion: 12, nextProtocolVersion: undefined });
    state.hooks.useAllProtocolVotes = ok(new Map([[hash(1), 12], [hash(2), 12], [hash(3), 11]]));
    renderWithProviders(<ProtocolPage />);
    expect(screen.queryByText('none voted')).toBeNull();
    expect(screen.getByText('most-voted version above v11')).toBeVisible();
    expect(screen.getByText('v12 (next):')).toBeVisible();
    expect(screen.getByText('Votes for v12')).toBeVisible();
    expect(screen.getByText('of 4 known evonodes')).toBeVisible();
  });

  it('degrades on a network without a known epoch length (devnet)', () => {
    state.hooks.useCurrentEpoch = failed('Current epoch is unavailable: this network has no verified epoch duration.');
    state.hooks.useAllEvonodeBlocksInEpoch = idle;
    state.hooks.useFinalizedEpochInfo = idle;
    state.hooks.useProtocolVersionUpgradeState = failed('state failed');
    renderWithProviders(<ProtocolPage />);
    // The epoch error is shown; votes still render even though versionUpgradeState failed.
    expect(screen.getByText('Current epoch unavailable')).toBeVisible();
    expect(screen.getByText(/no verified epoch duration/)).toBeVisible();
    expect(screen.getAllByText('unknown')).toHaveLength(2);
    expect(screen.getByText('needs the current version')).toBeVisible();
    expect(screen.getByText('v13:')).toBeVisible();
    expect(screen.getByText(/The current epoch could not be read on this network/)).toBeVisible();
    expect(screen.queryByText(/reading recent proposers/)).toBeNull();
    expect(screen.getByText(`proTxHash (3)`)).toBeVisible();
  });

  it('keeps the summary when versionUpgradeState fails', () => {
    state.hooks.useProtocolVersionUpgradeState = failed('state failed');
    renderWithProviders(<ProtocolPage />);
    expect(screen.getByText('from epoch #86')).toBeVisible();
    expect(screen.getByText('none voted')).toBeVisible();
  });

  it('warns when the vote walk stopped at its page cap', () => {
    state.hooks.useAllProtocolVotes = ok(truncated([[hash(1), 13]]));
    renderWithProviders(<ProtocolPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Results may be incomplete: reading the vote list');
  });
});

describe('EvonodesLeaderboard', () => {
  it('states totals across every proposer, not just the rows shown', () => {
    const entries = [{ proTxHash: hash(1), blocks: 9 }, { proTxHash: hash(2), blocks: 5 }, { proTxHash: hash(3), blocks: 1 }];
    renderWithProviders(<EvonodesLeaderboard entries={entries} limit={2} />);
    expect(screen.getByText(/Top 2 of 3 proposers · 15 blocks proposed/)).toBeVisible();
  });

  it('numbers ties with competition rank, as on /evonode', () => {
    const entries = [9, 5, 5, 1].map((blocks, i) => ({ proTxHash: hash(i + 1), blocks }));
    renderWithProviders(<EvonodesLeaderboard entries={entries} />);
    const ranks = screen.getAllByRole('link').map((row) => row.firstElementChild?.textContent);
    expect(ranks).toEqual(['1', '2', '2', '4']);
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
