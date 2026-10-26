import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { theme } from '@styles/theme';
import Page from '../page';

const CURSOR_1 = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const LAST_ID = '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6';

const state = vi.hoisted(() => ({
  result: { data: [] as unknown, isLoading: false, isError: false, error: null, refetch: vi.fn() },
  args: [] as unknown[],
}));
vi.mock('@sdk/queries', () => ({
  useDpnsPrefixSearch: (...args: unknown[]) => { state.args = args; return state.result; },
}));
vi.mock('@sdk/hooks', () => ({ useSdk: () => ({ network: 'mainnet' }) }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
vi.mock('@components/identity/DpnsDirectoryPanel', () => ({ DpnsDirectoryPanel: () => <p>DPNS directory</p> }));
vi.mock('@components/data/DpnsNameLink', () => ({ DpnsNameLink: ({ fqdn }: { fqdn: string }) => <span>{fqdn}</span> }));
vi.mock('@components/data/IdentityLink', () => ({ IdentityLink: () => null }));

/** A full page of `domain` documents labelled `${stem}00`, `${stem}01`, … */
function page(stem: string, normalizedStem: string, lastId = LAST_ID) {
  return Array.from({ length: 25 }, (_, i) => {
    const n = String(i).padStart(2, '0');
    return { id: i === 24 ? lastId : `id-${n}`, properties: { label: `${stem}${n}`, normalizedLabel: `${normalizedStem}${n}` } };
  });
}

function withUrl(searchParams: string, onUrlUpdate?: (event: UrlUpdateEvent) => void) {
  return (
    <ChakraProvider theme={theme}>
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
        <Page />
      </NuqsTestingAdapter>
    </ChakraProvider>
  );
}

beforeEach(() => {
  state.result.data = [];
  state.args = [];
});

it('queries the normalized prefix after the URL cursor and keeps both when paging on', async () => {
  state.result.data = page('Al', 'a1');
  const onUrlUpdate = vi.fn();
  render(withUrl(`?q=al&after=${CURSOR_1}`, onUrlUpdate));
  await act(async () => {});
  expect(state.args).toEqual(['a1', 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', 25, CURSOR_1]);
  expect(screen.getByText('page 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {});
  const last = onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent;
  expect(last.searchParams.get('q')).toBe('al');
  expect(last.searchParams.get('after')).toBe(`${CURSOR_1},${LAST_ID}`);
});

it('does not show the unfiltered directory beside prefix results', async () => {
  state.result.data = page('Al', 'a1');
  const { unmount } = render(withUrl('?q=al'));
  await act(async () => {});
  expect(screen.queryByText('DPNS directory')).not.toBeInTheDocument();
  unmount();
  render(withUrl(''));
  await act(async () => {});
  expect(screen.getByText('DPNS directory')).toBeInTheDocument();
});

it('explains homograph matches and never shows a row outside the prefix', async () => {
  const docs = page('Al', 'a1');
  docs[1] = { id: 'id-air', properties: { label: 'airjordan', normalizedLabel: 'a1rj0rdan' } };
  docs[24] = { id: LAST_ID, properties: { label: '0-0', normalizedLabel: '0-0' } };
  state.result.data = docs;
  const onUrlUpdate = vi.fn();
  render(withUrl('?q=al', onUrlUpdate));
  await act(async () => {});
  expect(screen.getByText('airjordan.dash')).toBeInTheDocument();
  expect(screen.getByText('a1rj0rdan')).toBeInTheDocument();
  expect(screen.queryByText('0-0.dash')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Hid 1 returned name not starting with a1.');
  // The hidden row is the last one returned: paging still continues from it
  // rather than stopping early or stepping back to the last shown row.
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {});
  expect((onUrlUpdate.mock.calls.at(-1)![0] as UrlUpdateEvent).searchParams.get('after')).toBe(LAST_ID);
});

it('says there are no more names past the last page', async () => {
  render(withUrl(`?q=al&after=${CURSOR_1}`));
  await act(async () => {});
  expect(screen.getByText(/No more DPNS names begin with/)).toBeInTheDocument();
});
