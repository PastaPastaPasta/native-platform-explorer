import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TestProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { QueryPage } from '../QueryPage';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
}));

const contract = {
  documents: { domain: { properties: { label: { type: 'string' } }, indices: [] } },
};
function sdkWithQuery(query: ReturnType<typeof vi.fn>) {
  return createMockSdk({
    contracts: {
      fetch: vi.fn().mockResolvedValue(contract),
      fetchWithProof: vi.fn().mockResolvedValue({ data: contract }),
    },
    documents: { query, queryWithProof: query },
  });
}
function setSql(sql: string) {
  fireEvent.change(screen.getByLabelText('SQL Query'), { target: { value: sql } });
}
function runSql(sql: string) {
  setSql(sql);
  fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  navigation.search = new URLSearchParams();
  navigation.replace.mockClear();
});

describe('Query workspace execution', () => {
  it('shows a structured SDK query failure and fetches current results after Retry', async () => {
    const query = vi.fn().mockRejectedValue({ message: 'Document endpoint unavailable', kind: 17 });
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain LIMIT 1');
    await screen.findByText('Document endpoint unavailable');
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
    query.mockResolvedValue({ data: [{ $id: 'current', label: 'Recovered response' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Recovered response');
    expect(screen.queryByText('Document endpoint unavailable')).not.toBeInTheDocument();
  });

  it('refetches unchanged SQL and puts the network in the query link', async () => {
    const query = vi.fn().mockResolvedValue({ data: [{ $id: 'one', label: 'first' }] });
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    // A partial page needs no follow-up request for a next page.
    runSql('SELECT * FROM domain LIMIT 2');
    await screen.findByText('first');
    expect(query).toHaveBeenCalledTimes(1);
    query.mockResolvedValueOnce({ data: [{ $id: 'two', label: 'updated' }] });
    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    await screen.findByText('updated');
    expect(query).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining('network=testnet&trusted=1'),
      { scroll: false },
    );
  });

  it('tells a recipient when a shared link came from a different trust mode', async () => {
    navigation.search = new URLSearchParams({ q: 'SELECT * FROM domain LIMIT 1', trusted: '0' });
    // Running the shared query rewrites the address with the recipient's mode.
    navigation.replace.mockImplementation((url: string) => { navigation.search = new URLSearchParams(url.split('?')[1]); });
    const query = vi.fn().mockResolvedValue({ data: [] });
    const { unmount } = renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    await waitFor(() => expect(navigation.search.get('trusted')).toBe('1'));
    await screen.findByText('0 documents returned');
    expect(screen.getByText(/This link was shared from untrusted mode, but trusted mode\s+is on here/)).toHaveTextContent(
      "Your results are proof-verified; the sender's were not.",
    );
    navigation.replace.mockReset();
    unmount();
    navigation.search = new URLSearchParams({ q: 'SELECT * FROM domain LIMIT 1', trusted: '1' });
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    expect(screen.queryByText(/This link was shared from/)).not.toBeInTheDocument();
  });

  it('bounds statement execution and cancels queued and late results', async () => {
    const pending = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let requests = 0;
    const query = vi.fn().mockImplementation(() => pending[requests++]!.promise);
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql(
      "SELECT * FROM domain WHERE label == 'a'; SELECT * FROM domain WHERE label == 'b'; SELECT * FROM domain WHERE label == 'c'",
    );
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Queued')).toBeInTheDocument();
    await act(async () => pending[0]!.resolve({ data: [{ $id: 'a', label: 'A result' }] }));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    await act(async () => {
      pending[1]!.resolve({ data: [{ $id: 'b', label: 'Late result' }] });
      pending[2]!.resolve({ data: [{ $id: 'c', label: 'Later result' }] });
    });
    expect(screen.queryByText('Late result')).not.toBeInTheDocument();
    expect(screen.queryByText('Later result')).not.toBeInTheDocument();
    expect(screen.getByText(/Cancelled. Queued statements/)).toBeInTheDocument();
  });

  it('discards current results immediately when SQL or the SDK network changes', async () => {
    const query = vi.fn().mockResolvedValue({ data: [{ $id: 'one', label: 'testnet result' }] });
    const sdk = sdkWithQuery(query);
    const { rerender } = render(
      <TestProviders sdk={{ sdk }}>
        <QueryPage />
      </TestProviders>,
    );
    runSql('SELECT * FROM domain');
    await screen.findByText('testnet result');
    setSql('SELECT * FROM domain LIMIT 1');
    expect(screen.queryByText('testnet result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    await screen.findByText('testnet result');
    await act(async () =>
      rerender(
        <TestProviders sdk={{ sdk, network: 'mainnet' }}>
          <QueryPage />
        </TestProviders>,
      ),
    );
    expect(screen.queryByText('testnet result')).not.toBeInTheDocument();
  });

  it('starts a fresh request after cancelling and rerunning identical SQL', async () => {
    const previous = deferred<unknown>();
    const current = deferred<unknown>();
    const query = vi
      .fn()
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(current.promise);
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain');
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await act(async () =>
      previous.resolve({ data: [{ $id: 'old', label: 'Cancelled response' }] }),
    );
    expect(screen.queryByText('Cancelled response')).not.toBeInTheDocument();
    await act(async () => current.resolve({ data: [{ $id: 'new', label: 'Current response' }] }));
    await screen.findByText('Current response');
  });

  it('does not reuse an in-flight request after the SDK reconnects on the same network', async () => {
    const previous = deferred<unknown>();
    const firstQuery = vi.fn().mockReturnValue(previous.promise);
    const secondQuery = vi
      .fn()
      .mockResolvedValue({ data: [{ $id: 'new', label: 'Reconnected response' }] });
    const { rerender } = render(
      <TestProviders sdk={{ sdk: sdkWithQuery(firstQuery) }}>
        <QueryPage />
      </TestProviders>,
    );
    runSql('SELECT * FROM domain');
    await waitFor(() => expect(firstQuery).toHaveBeenCalledTimes(1));
    rerender(
      <TestProviders sdk={{ sdk: sdkWithQuery(secondQuery) }}>
        <QueryPage />
      </TestProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    await screen.findByText('Reconnected response');
    expect(secondQuery).toHaveBeenCalledTimes(1);
    await act(async () => previous.resolve({ data: [{ $id: 'old', label: 'Old SDK response' }] }));
    expect(screen.queryByText('Old SDK response')).not.toBeInTheDocument();
  });

  it('uses an explicit 25-document page when LIMIT is omitted', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({
        data: Array.from({ length: 25 }, (_, i) => ({ $id: `doc-${i}`, label: `Label ${i}` })),
      });
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain');
    await screen.findByText('25 documents returned');
    expect(query.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ limit: 25 }));
    expect(screen.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  });

  it('paginates each statement independently', async () => {
    const query = vi
      .fn()
      .mockImplementation((params: { where?: unknown[][]; startAfter?: string }) => {
        const filter = params.where?.[0]?.[2];
        return Promise.resolve({
          data: [
            {
              $id: `${filter}-${params.startAfter ? '2' : '1'}`,
              label: `${filter} page ${params.startAfter ? '2' : '1'}`,
            },
          ],
        });
      });
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql(
      "SELECT * FROM domain WHERE label == 'a' LIMIT 1; SELECT * FROM domain WHERE label == 'b' LIMIT 1",
    );
    await screen.findByText('a page 1');
    await screen.findByText('b page 1');
    fireEvent.click(screen.getAllByRole('button', { name: /^Next$/ })[0]!);
    await screen.findByText('a page 2');
    expect(screen.getByText('b page 1')).toBeInTheDocument();
    expect(query.mock.calls.map(([params]) => params)).toContainEqual(expect.objectContaining({ startAfter: 'a-1' }));
  });

  it('disables Next when a full page is the last one', async () => {
    const page = new Map([['doc-1', { $id: 'doc-1', label: 'one' }], ['doc-2', { $id: 'doc-2', label: 'two' }]]);
    const query = vi.fn().mockImplementation((params: { startAfter?: string }) =>
      Promise.resolve({ data: params.startAfter ? new Map() : page }),
    );
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain LIMIT 2');
    await screen.findByText('two');
    await waitFor(() => expect(query).toHaveBeenCalledWith(expect.objectContaining({ limit: 1, startAfter: 'doc-2' })));
    await waitFor(() => expect(screen.queryByText(/checking for more/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  it('still offers Next for a full page when the follow-up request fails', async () => {
    const page = new Map([['doc-1', { $id: 'doc-1', label: 'one' }]]);
    const query = vi.fn().mockImplementation((params: { startAfter?: string }) =>
      params.startAfter ? Promise.reject(new Error('endpoint unavailable')) : Promise.resolve({ data: page }),
    );
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain LIMIT 1');
    await screen.findByText('one');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Next$/ })).toBeEnabled());
  });

  it('counts absent documents toward a full page and continues after them', async () => {
    const page = new Map<string, unknown>([['doc-1', { $id: 'doc-1', label: 'one' }], ['doc-gone', undefined]]);
    const query = vi.fn().mockImplementation((params: { startAfter?: string }) =>
      Promise.resolve({ data: params.startAfter ? new Map([['doc-3', { $id: 'doc-3', label: 'three' }]]) : page }),
    );
    renderWithProviders(<QueryPage />, { sdk: { sdk: sdkWithQuery(query) } });
    runSql('SELECT * FROM domain LIMIT 2');
    await screen.findByText('one');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Next$/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
    await screen.findByText('three');
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, startAfter: 'doc-gone' }));
  });
});

describe('Query workspace index guidance', () => {
  const dpns = {
    documents: {
      domain: {
        properties: { normalizedLabel: { type: 'string' }, normalizedParentDomainName: { type: 'string' } },
        indices: [
          { name: 'parentNameAndLabel', properties: [{ normalizedParentDomainName: 'asc' }, { normalizedLabel: 'asc' }], unique: true },
        ],
      },
    },
  };
  const COUNT_ERROR =
    "transport error: grpc error: code: 'Client specified an invalid argument', message: \"where clause on non indexed property error: prove count requires a `countable: true` (or summableOffCountIndex) index whose properties exactly match the where clause fields\"";
  function dpnsSdk(documents: Record<string, unknown>) {
    return createMockSdk({
      contracts: { fetch: vi.fn().mockResolvedValue(dpns), fetchWithProof: vi.fn().mockResolvedValue({ data: dpns }) },
      documents,
    });
  }

  it('accepts a two-sided range on one field and warns about a missing ORDER BY', async () => {
    const query = vi.fn().mockResolvedValue({ data: [] });
    renderWithProviders(<QueryPage />, { sdk: { sdk: dpnsSdk({ query, queryWithProof: query }) } });
    runSql("SELECT * FROM domain WHERE normalizedParentDomainName = 'dash' AND normalizedLabel >= 'a' AND normalizedLabel <= 'b' ORDER BY normalizedLabel");
    await screen.findByText('0 documents returned');
    expect(screen.queryByText(/will probably reject/)).not.toBeInTheDocument();

    runSql("SELECT * FROM domain WHERE normalizedParentDomainName = 'dash' AND normalizedLabel > 'a'");
    expect(await screen.findByText(/The range filter on `normalizedLabel` needs ORDER BY normalizedLabel/)).toBeInTheDocument();
  });

  it('warns before an aggregate without a countable index and explains the Platform error', async () => {
    const count = vi.fn().mockRejectedValue(new Error(COUNT_ERROR));
    renderWithProviders(<QueryPage />, { sdk: { sdk: dpnsSdk({ count, countWithProof: count }) } });
    runSql("SELECT COUNT(*) FROM domain WHERE normalizedParentDomainName = 'dash'");
    expect(await screen.findByText(/A filtered COUNT needs a countable index/)).toBeInTheDocument();
    expect(await screen.findByText(/This document type has no index that supports this aggregate/)).toBeInTheDocument();
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: [['normalizedParentDomainName', '==', 'dash']] }));
  });
});
