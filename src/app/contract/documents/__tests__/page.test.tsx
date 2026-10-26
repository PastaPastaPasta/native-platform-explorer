import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { renderWithProviders } from '@/test/render';
import DocumentsPage from '../page';

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const doc = (i: number) => ({ $id: `${'A'.repeat(42)}${String.fromCharCode(97 + i)}`, $ownerId: 'B'.repeat(43), normalizedLabel: `a${i}` });

const state = vi.hoisted(() => ({ calls: [] as unknown[], rows: 2 }));
const { idle } = vi.hoisted(() => ({ idle: { data: undefined, isLoading: false, isError: false } }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(`id=${DPNS}&type=domain`),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: () => {} }));
vi.mock('@sdk/health', () => ({ usePlatformProtocolVersion: () => 14 }));
vi.mock('@sdk/queries', () => ({
  // Owner cells resolve DPNS aliases.
  useDpnsUsername: () => idle,
  useDpnsIsContested: () => idle,
  useContract: () => ({
    isLoading: false, isError: false, data: {
      documentSchemas: {
        domain: {
          properties: { normalizedParentDomainName: { type: 'string' }, normalizedLabel: { type: 'string' } },
          indices: [{ name: 'parentNameAndLabel', properties: [{ normalizedParentDomainName: 'asc' }, { normalizedLabel: 'asc' }] }],
        },
      },
    },
  }),
  useDocumentsQuery: (params: unknown) => {
    state.calls.push(params);
    return { isLoading: false, isError: false, data: params ? Array.from({ length: state.rows }, (_, i) => doc(i)) : undefined };
  },
}));

beforeEach(() => {
  state.calls = [];
  state.rows = 2;
});

function render(searchParams: string, onUrlUpdate = vi.fn()) {
  renderWithProviders(
    <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
      <DocumentsPage />
    </NuqsTestingAdapter>,
  );
  return onUrlUpdate;
}

const lastUrl = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0].searchParams as URLSearchParams;

describe('documents browser URL state', () => {
  it('reads filters, order, limit and cursor from the URL and sends the typed query', () => {
    const where = JSON.stringify([['normalizedParentDomainName', '==', 'dash'], ['normalizedLabel', 'startsWith', 'a1']]);
    render(`where=${encodeURIComponent(where)}&order=normalizedLabel:desc&limit=10&after=CUR1`);
    expect(state.calls.at(-1)).toEqual({
      dataContractId: DPNS,
      documentTypeName: 'domain',
      where: [['normalizedParentDomainName', '==', 'dash'], ['normalizedLabel', 'startsWith', 'a1']],
      orderBy: [['normalizedLabel', 'desc']],
      limit: 10,
      startAfter: 'CUR1',
    });
    expect(screen.getByText('page 2')).toBeVisible();
  });

  it('applies edits to the URL and clears the cursor stack', async () => {
    const spy = render('after=CUR1');
    fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }));
    fireEvent.change(screen.getByLabelText('Filter 1 value'), { target: { value: 'dash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(JSON.parse(lastUrl(spy).get('where')!)).toEqual([['normalizedParentDomainName', '==', 'dash']]);
    expect(lastUrl(spy).has('after')).toBe(false);
  });

  it('pushes the last document ID as the next cursor', async () => {
    state.rows = 25;
    const spy = render('');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastUrl(spy).get('after')).toBe(doc(24).$id);
    expect(spy.mock.calls.at(-1)![0].options.history).toBe('push');
  });

  it('Reset discards unapplied draft rows even when nothing was applied', async () => {
    render('');
    fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }));
    expect(screen.getByLabelText('Filter 1 value')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.queryByLabelText('Filter 1 value')).toBeNull());
  });
});
