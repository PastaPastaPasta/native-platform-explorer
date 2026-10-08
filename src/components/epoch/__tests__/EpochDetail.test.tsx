import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '@/app/epoch/detail/page';
import { renderWithProviders } from '@/test/render';

const hooks = vi.hoisted(() => ({
  epoch: {} as Record<string, unknown>, finalized: {} as Record<string, unknown>, live: {} as Record<string, unknown>,
  useLive: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('index=42') }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: () => {} }));
vi.mock('@sdk/queries', () => ({
  useEpochInfo: () => hooks.epoch,
  useFinalizedEpochInfo: () => hooks.finalized,
  useEvonodesBlocksByRange: (...args: unknown[]) => { hooks.useLive(...args); return hooks.live; },
}));

function query(status = 'success', data: unknown = new Map()) {
  return { status, data, isLoading: false, isError: status === 'error', error: status === 'error' ? new Error('source outage') : null, refetch: vi.fn() };
}
const metadata = new Map([[42, { index: 42, firstBlockTime: 1720000000000n, firstBlockHeight: 121n }]]);
function finalized(proposers = new Map([['finalized-proposer', 12n]])) {
  // Native fields are prototype getters; spreading the instance loses them.
  return Object.create({ firstBlockHeight: 121n, firstBlockTime: 1720000000000n, totalBlocksInEpoch: 4586n,
    totalProcessingFees: 9007199254740993n, totalDistributedStorageFees: 0n, totalCreatedStorageFees: 29664630880n,
    coreBlockRewards: 248888105626359n, protocolVersion: 1, blockProposers: proposers });
}
beforeEach(() => {
  hooks.epoch = query('success', metadata);
  hooks.finalized = query('success', new Map([[42, finalized()]]));
  hooks.live = query('success', new Map([['stale-live-proposer', 99n]]));
  hooks.useLive.mockClear();
});

describe('historical epoch source presentation', () => {
  it.each(['success', 'error'])('uses finalized totals/proposers despite %s live result', (liveStatus) => {
    hooks.live = query(liveStatus);
    renderWithProviders(<Page />);
    expect(screen.getByRole('heading', { name: 'Epoch #42' })).toBeVisible();
    expect(screen.getByText('9007199254740993')).toBeVisible();
    expect(screen.getByText('Storage fees distributed (credits)').parentElement).toHaveTextContent('0');
    expect(screen.getByRole('link', { name: /finalized-/ })).toHaveAttribute('href', '/evonode?proTxHash=finalized-proposer');
    expect(hooks.useLive).toHaveBeenCalledWith(undefined, 100);
  });
  it('retains a cached finalized record and reports a refresh failure with its own retry', () => {
    hooks.finalized = query('error', new Map([[42, finalized()]]));
    renderWithProviders(<Page />);
    expect(screen.getByText('9007199254740993')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Finalized refresh unavailable' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hooks.finalized.refetch).toHaveBeenCalledOnce();
  });
  it('treats an empty finalized proposer map as authoritative', () => {
    hooks.finalized = query('success', new Map([[42, finalized(new Map())]]));
    renderWithProviders(<Page />);
    expect(screen.getByText('No recorded proposers for this finalized epoch.')).toBeVisible();
    expect(screen.queryByRole('link', { name: /stale-live/ })).not.toBeInTheDocument();
  });
  it.each(['pending', 'error'])('keeps finalized data available while metadata is %s', (status) => {
    hooks.epoch = query(status);
    renderWithProviders(<Page />);
    expect(screen.getByRole('heading', { name: 'Epoch #42' })).toBeVisible();
    expect(screen.getByText('9007199254740993')).toBeVisible();
    expect(screen.getByRole('link', { name: /finalized-/ })).toBeVisible();
  });
  it.each(['pending', 'error'])('retains ordinary metadata while finalized is %s', (status) => {
    hooks.finalized = query(status);
    renderWithProviders(<Page />);
    expect(screen.getByRole('heading', { name: 'Epoch #42' })).toBeVisible();
    expect(screen.queryByText('Epoch not found')).not.toBeInTheDocument();
    expect(screen.queryByText('No proposers yet this epoch.')).not.toBeInTheDocument();
    expect(hooks.useLive).toHaveBeenCalledWith(undefined, 100);
    if (status === 'error') {
      expect(screen.getByRole('heading', { name: 'Finalized details unavailable' })).toBeVisible();
      fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
      expect(hooks.finalized.refetch).toHaveBeenCalledOnce();
      expect(hooks.epoch.refetch).not.toHaveBeenCalled();
    }
  });
  it('waits for a disabled/pending finalized query before declaring an empty epoch absent', () => {
    hooks.epoch = query(); hooks.finalized = query('pending');
    renderWithProviders(<Page />);
    expect(screen.queryByText('Epoch not found')).not.toBeInTheDocument();
    expect(screen.queryByText('No proposers yet this epoch.')).not.toBeInTheDocument();
  });
  it('reports unavailable, with the correct retry, when the other source is empty', () => {
    hooks.epoch = query(); hooks.finalized = query('error');
    renderWithProviders(<Page />);
    expect(screen.queryByText('Epoch not found')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
    expect(hooks.finalized.refetch).toHaveBeenCalledOnce();
  });
  it('reports absence only after both sources succeed without the requested record', () => {
    hooks.epoch = query(); hooks.finalized = query();
    renderWithProviders(<Page />);
    expect(screen.getByText('Epoch not found')).toBeVisible();
  });
  it('uses live proposers once finalized lookup succeeds empty', () => {
    hooks.finalized = query();
    renderWithProviders(<Page />);
    expect(screen.getByRole('link', { name: /stale-live/ })).toBeVisible();
    expect(hooks.useLive).toHaveBeenCalledWith(42, 100);
  });
  it('retries metadata independently while keeping finalized data visible', () => {
    hooks.epoch = query('error');
    renderWithProviders(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hooks.epoch.refetch).toHaveBeenCalledOnce();
    expect(hooks.finalized.refetch).not.toHaveBeenCalled();
  });
});
