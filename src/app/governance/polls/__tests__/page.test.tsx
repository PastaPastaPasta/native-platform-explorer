import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Page from '../page';

const query = vi.hoisted(() => vi.fn(() => ({ data: [], isLoading: false, isError: false })));
vi.mock('@sdk/queries', () => ({ useVotePollsByEndDate: query }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it('hydrates a static export without a date mismatch, then uses the current browser time', async () => {
  const builtAt = Date.UTC(2026, 9, 22, 12);
  const visitedAt = Date.UTC(2026, 9, 23, 15, 42, 15);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(builtAt);
  const container = document.createElement('div');
  container.innerHTML = renderToString(<Page />);
  document.body.appendChild(container);
  clock.mockReturnValue(visitedAt);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, <Page />, { onRecoverableError: (error) => errors.push(error) });
    });
    expect(errors).toEqual([]);
    const start = Math.floor(visitedAt / 60_000) * 60_000;
    expect(query).toHaveBeenLastCalledWith(start, undefined);
    expect(container).toHaveTextContent(`Querying ${new Date(start).toLocaleString()} → no upper bound`);
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs[0]).toHaveValue('2026-10-23');
    expect(inputs[1]).toHaveValue('2026-11-22');
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
