import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { PrefetchHost } from '@components/layout/PrefetchHost';
import { useIdentity } from '@sdk/queries';
import {
  getActivePrefetches,
  MAX_ACTIVE_PREFETCHES,
  PREFETCH_DELAY_MS,
  requestPrefetch,
  resetPrefetchesForTests,
  usePrefetchProps,
  type PrefetchTarget,
} from '../usePrefetch';

const ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

function Link({ target }: { target: PrefetchTarget }) {
  return <a href="#x" {...usePrefetchProps(target)}>open</a>;
}

function Page() {
  const q = useIdentity(ID);
  return <p>{q.data ? 'loaded' : 'empty'}</p>;
}

beforeEach(() => resetPrefetchesForTests());
afterEach(() => vi.useRealTimers());

describe('prefetch queue', () => {
  it('dedupes per session and caps concurrent prefetches', () => {
    expect(requestPrefetch({ kind: 'identity', id: ID }, 1)).toBe(true);
    expect(requestPrefetch({ kind: 'identity', id: ID }, 1)).toBe(false);
    for (let i = 0; i < MAX_ACTIVE_PREFETCHES; i++) requestPrefetch({ kind: 'epoch', index: i }, 1);
    expect(getActivePrefetches().size).toBe(MAX_ACTIVE_PREFETCHES);
  });
});

describe('prefetch on hover', () => {
  function setup(status: 'ready' | 'connecting' = 'ready') {
    const fetch = vi.fn().mockResolvedValue({ id: ID });
    const sdk = createMockSdk({ identities: { fetch } });
    const client: QueryClient = createTestQueryClient();
    const view = renderWithProviders(
      <>
        <Link target={{ kind: 'identity', id: ID }} />
        <PrefetchHost />
      </>,
      { sdk: { sdk, status }, queryClient: client },
    );
    return { fetch, client, view };
  }

  it('runs the page’s own query after a short mouse hover, once', async () => {
    vi.useFakeTimers();
    const { fetch, client, view } = setup();
    const link = screen.getByText('open');
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    await act(async () => { vi.advanceTimersByTime(PREFETCH_DELAY_MS); });
    vi.useRealTimers();
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    // The page then reads the cached result under the same key.
    view.rerender(<Page />);
    expect(screen.getByText('loaded')).toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ['npe', 'testnet', true, 1, 'identities', 'fetch', ID] })).toHaveLength(1);
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores touch, quick pass-overs and a session that is not ready', async () => {
    vi.useFakeTimers();
    const { fetch } = setup();
    const link = screen.getByText('open');
    fireEvent.pointerEnter(link, { pointerType: 'touch' });
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    fireEvent.pointerLeave(link);
    await act(async () => { vi.advanceTimersByTime(PREFETCH_DELAY_MS * 2); });
    expect(fetch).not.toHaveBeenCalled();
    expect(getActivePrefetches().size).toBe(0);
  });

  it('does nothing before the SDK is ready', async () => {
    vi.useFakeTimers();
    const { fetch } = setup('connecting');
    fireEvent.pointerEnter(screen.getByText('open'), { pointerType: 'mouse' });
    await act(async () => { vi.advanceTimersByTime(PREFETCH_DELAY_MS * 2); });
    expect(fetch).not.toHaveBeenCalled();
  });
});
