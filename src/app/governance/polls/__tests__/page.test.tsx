import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { fireEvent, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, expect, it, vi } from 'vitest';
import { theme } from '@styles/theme';
import Page from '../page';

const query = vi.hoisted(() => vi.fn((..._args: unknown[]) => ({ data: [] as unknown[], isLoading: false, isError: false })));
vi.mock('@sdk/queries', () => ({ useVotePollsByEndDate: query }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  query.mockClear();
});

function withUrl(searchParams = '', onUrlUpdate?: (event: UrlUpdateEvent) => void) {
  return (
    <ChakraProvider theme={theme}>
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
        <Page />
      </NuqsTestingAdapter>
    </ChakraProvider>
  );
}

it('hydrates a static export without a date mismatch, then uses the current browser time', async () => {
  const builtAt = Date.UTC(2026, 9, 22, 12);
  const visitedAt = Date.UTC(2026, 9, 23, 15, 42, 15);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(builtAt);
  const container = document.createElement('div');
  container.innerHTML = renderToString(withUrl());
  document.body.appendChild(container);
  clock.mockReturnValue(visitedAt);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, withUrl(), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(errors).toEqual([]);
    const start = Math.floor(visitedAt / 60_000) * 60_000;
    expect(query).toHaveBeenLastCalledWith(start, undefined, true);
    // Every render before the clock was read keeps the query disabled.
    for (const [callStart, , enabled] of query.mock.calls as unknown as [number | undefined, number | undefined, boolean][]) {
      if (callStart === undefined) expect(enabled).toBe(false);
    }
    expect(container).toHaveTextContent(`Querying ${new Date(start).toLocaleString()} → no upper bound`);
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs[0]).toHaveValue('2026-10-23');
    expect(inputs[1]).toHaveValue('2026-11-22');
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});

it('reads the window and custom dates from the URL', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 23, 15));
  render(withUrl('?window=custom&from=2026-11-01&to=2026-11-10'));
  await act(async () => {});
  expect(query).toHaveBeenLastCalledWith(Date.UTC(2026, 10, 1), Date.UTC(2026, 10, 10), true);
  expect(screen.getByLabelText('Polls ending from')).toHaveValue('2026-11-01');
  expect(screen.getByRole('button', { name: 'Custom…' })).toHaveAttribute('aria-pressed', 'true');
});

it('writes a chosen window to the URL and resets the page', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 23, 15));
  const onUrlUpdate = vi.fn();
  render(withUrl('?page=3', onUrlUpdate));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Next 7 d' }));
  await act(async () => {});
  const last = onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent;
  expect(last.queryString).toBe('?window=7d');
  expect(last.options.history).toBe('push');
});

it('pages and sorts the returned end-time buckets', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 23, 15));
  const buckets = Array.from({ length: 25 }, (_, i) => ({ timestampMs: BigInt(1_800_000_000_000 + i * 60_000), votePolls: [] }));
  query.mockReturnValue({ data: buckets, isLoading: false, isError: false });
  render(withUrl('?page=2'));
  await act(async () => {});
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
  expect(screen.getAllByText('No polls recorded for this bucket.')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: /Sort by end time/ }));
  expect(screen.getByRole('button', { name: /latest first/ })).toBeInTheDocument();
});
