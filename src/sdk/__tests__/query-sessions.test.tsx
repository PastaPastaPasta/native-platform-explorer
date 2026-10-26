import React, { type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SdkContext, type SdkContextValue } from '../SdkProvider';
import { getSdkQueryKey, invalidateNetworkQueries, useSdkQuery } from '../hooks';
import {
  useAllEvonodeBlocksInEpoch,
  useAllProtocolVotes,
  useDocument,
  useDocumentsQuery,
  useDocumentsAggregate,
  useSystemStatus,
  useTotalCreditsInPlatform,
} from '../queries';
import { QueryProofStoreProvider, useQueryProofStore } from '@/contexts/QueryProofStore';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { createTestQueryClient } from '@/test/render';
import { SdkSessionError, shouldRetrySdkQuery } from '../errors';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function Boundary({ client, context, children }: {
  client: QueryClient;
  context: SdkContextValue;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <SdkContext.Provider value={context}>
        <QueryProofStoreProvider>{children}</QueryProofStoreProvider>
      </SdkContext.Provider>
    </QueryClientProvider>
  );
}

function Probe() {
  const q = useTotalCreditsInPlatform();
  const store = useQueryProofStore();
  return <>
    <div data-testid="value">{String(q.data ?? 'pending')}</div>
    <div data-testid="entries">{store.entries.map((entry) => String(entry.result)).join(',')}</div>
  </>;
}

const clients: QueryClient[] = [];
function client() {
  const result = createTestQueryClient();
  clients.push(result);
  return result;
}
afterEach(() => {
  clients.forEach((item) => item.clear());
  clients.length = 0;
  vi.useRealTimers();
});

describe('SDK query readiness and sessions', () => {
  it.each([true, () => true])('cannot override SDK readiness with enabled=%s', async (enabled) => {
    const queryClient = client();
    const fetch = vi.fn().mockResolvedValue('ready data');
    const sdk = createMockSdk();
    const pending = createSdkContextValue({ sdk, status: 'connecting' });
    function OrdinaryProbe() {
      const q = useSdkQuery<string>(['readiness'], fetch, { enabled });
      return <div>{q.status}:{q.data ?? ''}</div>;
    }
    const view = render(<Boundary client={queryClient} context={pending}><OrdinaryProbe /></Boundary>);
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<Boundary client={queryClient} context={{ ...pending, status: 'ready' }}><OrdinaryProbe /></Boundary>);
    expect(await screen.findByText('success:ready data')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe(sdk);
  });

  it('gates proof-aware queries until a ready SDK exists', async () => {
    const queryClient = client();
    const fetch = vi.fn().mockResolvedValue({ data: 8 });
    const sdk = createMockSdk({ system: { totalCreditsInPlatformWithProof: fetch } });
    const pending = createSdkContextValue({ sdk: null, status: 'connecting' });
    const view = render(<Boundary client={queryClient} context={pending}><Probe /></Boundary>);
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('value')).toHaveTextContent('pending');
    view.rerender(<Boundary client={queryClient} context={{ ...pending, sdk, status: 'ready' }}><Probe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('8'));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['network switch', 'reconnect', 'trust change'] as const)(
    'discards a delayed old response after %s without publishing inspector evidence',
    async (change) => {
      const queryClient = client();
      const old = deferred<{ data: number }>();
      const oldFetch = vi.fn().mockReturnValue(old.promise);
      const controller = new AbortController();
      const oldContext = createSdkContextValue({
        sessionId: 10,
        sessionSignal: controller.signal,
        sdk: createMockSdk({ system: { totalCreditsInPlatformWithProof: oldFetch } }),
      });
      const nextContext = createSdkContextValue({
        sessionId: 11,
        sessionSignal: new AbortController().signal,
        network: change === 'network switch' ? 'mainnet' : oldContext.network,
        trusted: change !== 'trust change',
        sdk: createMockSdk({ system: {
          totalCreditsInPlatformWithProof: vi.fn().mockResolvedValue({ data: 22 }),
          totalCreditsInPlatform: vi.fn().mockResolvedValue(22),
        } }),
      });
      const view = render(<Boundary client={queryClient} context={oldContext}><Probe /></Boundary>);
      await waitFor(() => expect(oldFetch).toHaveBeenCalledOnce());
      act(() => controller.abort());
      view.rerender(<Boundary client={queryClient} context={nextContext}><Probe /></Boundary>);
      await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('22'));
      await act(async () => { old.resolve({ data: 99 }); await old.promise; });
      expect(screen.getByTestId('value')).toHaveTextContent('22');
      expect(screen.getByTestId('entries')).toHaveTextContent('22');
      expect(screen.getByTestId('entries')).not.toHaveTextContent('99');
      expect(queryClient.getQueryData(getSdkQueryKey(oldContext, ['system', 'totalCreditsInPlatform']))).toBeUndefined();
      expect(queryClient.getQueryState(getSdkQueryKey(oldContext, ['system', 'totalCreditsInPlatform']))?.fetchStatus).toBe('idle');
    },
  );

  it('does not start a fallback against an obsolete session after a proof rejection', async () => {
    const queryClient = client();
    const old = deferred<unknown>();
    const proofFetch = vi.fn().mockReturnValue(old.promise);
    const fallback = vi.fn().mockResolvedValue(99);
    const controller = new AbortController();
    const context = createSdkContextValue({ sessionSignal: controller.signal, sdk: createMockSdk({ system: {
      totalCreditsInPlatformWithProof: proofFetch, totalCreditsInPlatform: fallback,
    } }) });
    render(<Boundary client={queryClient} context={context}><Probe /></Boundary>);
    await waitFor(() => expect(proofFetch).toHaveBeenCalledOnce());
    act(() => controller.abort());
    await act(async () => { old.reject(new Error('late transport error')); await old.promise.catch(() => {}); });
    expect(fallback).not.toHaveBeenCalled();
    expect(screen.getByTestId('entries')).toBeEmptyDOMElement();
  });
});

describe('paginated walks and session retirement', () => {
  const hash = (n: number) => n.toString(16).padStart(64, '0');
  const fullPage = (value: unknown) => new Map(Array.from({ length: 100 }, (_, i) => [hash(i + 1), value]));

  it.each(['votes', 'proposers'] as const)('stops the %s walk after the session retires mid-walk', async (kind) => {
    const queryClient = client();
    const first = deferred<Map<string, unknown>>();
    const page = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(new Map());
    const controller = new AbortController();
    const context = createSdkContextValue({
      trusted: false,
      sessionSignal: controller.signal,
      sdk: createMockSdk(kind === 'votes'
        ? { protocol: { versionUpgradeVoteStatus: page } }
        : { epoch: { evonodesProposedBlocksByRange: page } }),
    });
    function WalkProbe() {
      const votes = useAllProtocolVotes();
      const blocks = useAllEvonodeBlocksInEpoch(kind === 'proposers' ? 7 : undefined);
      const q = kind === 'votes' ? votes : blocks;
      return <div data-testid="walk">{q.status}:{q.data instanceof Map ? q.data.size : ''}</div>;
    }
    render(<Boundary client={queryClient} context={context}><WalkProbe /></Boundary>);
    await waitFor(() => expect(page).toHaveBeenCalledOnce());
    act(() => controller.abort());
    // A full first page would normally request a second one.
    await act(async () => {
      first.resolve(fullPage(kind === 'votes' ? Object.create({ version: 13 }) : 1n));
      await first.promise;
    });
    expect(page).toHaveBeenCalledOnce();
    expect(screen.getByTestId('walk')).not.toHaveTextContent('success');
  });
});

describe('SDK freshness policies', () => {
  it.each(['documents', 'aggregate'] as const)('isolates repeated %s executions with unchanged inputs', async (kind) => {
    const queryClient = client();
    const firstResponse = deferred<never>();
    const fetch = vi.fn().mockReturnValueOnce(firstResponse.promise).mockResolvedValue(kind === 'documents' ? ['second run'] : new Map([['count', 2n]]));
    const context = createSdkContextValue({ trusted: false, sdk: createMockSdk({
      documents: kind === 'documents' ? { query: fetch } : { count: fetch },
    }) });
    const params = { dataContractId: 'contract', documentTypeName: 'type' };
    function DocumentsProbe({ executionId }: { executionId: number }) {
      const q = useDocumentsQuery(params, executionId);
      return <div data-testid="execution-result">{q.status}</div>;
    }
    function AggregateProbe({ executionId }: { executionId: number }) {
      const q = useDocumentsAggregate(params, 'count', undefined, executionId);
      return <div data-testid="execution-result">{q.status}</div>;
    }
    const ExecutionProbe = kind === 'documents' ? DocumentsProbe : AggregateProbe;
    const view = render(<Boundary client={queryClient} context={context}><ExecutionProbe executionId={1} /></Boundary>);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    view.rerender(<Boundary client={queryClient} context={context}><ExecutionProbe executionId={2} /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('execution-result')).toHaveTextContent('success'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toEqual(params);
    expect(queryClient.getQueryCache().getAll().map((q) => q.queryKey.slice(-2))).toEqual([
      ['execution', 1], ['execution', 2],
    ]);
  });

  it('refetches a document by ID when its 30-second freshness expires', async () => {
    const queryClient = client();
    const get = vi.fn().mockResolvedValueOnce({ revision: 1 }).mockResolvedValue({ revision: 2 });
    const context = createSdkContextValue({ trusted: false, sdk: createMockSdk({ documents: { get } }) });
    function DocumentProbe() {
      const q = useDocument('contract', 'type', 'id');
      return <div data-testid="revision">{(q.data as { revision: number } | undefined)?.revision}</div>;
    }
    const first = render(<Boundary client={queryClient} context={context}><DocumentProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('1'));
    first.unmount();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_001);
    render(<Boundary client={queryClient} context={context}><DocumentProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('2'));
    expect(get).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('keeps Platform status polling while an idle page remains mounted', async () => {
    const queryClient = client();
    const status = vi.fn().mockResolvedValue({ chain: { latestBlockHeight: 1 } });
    const context = createSdkContextValue({ sdk: createMockSdk({ system: { status } }) });
    function StatusProbe() { useSystemStatus(); return null; }
    vi.useFakeTimers();
    render(<Boundary client={queryClient} context={context}><StatusProbe /></Boundary>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(status).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('refreshes active documents after a confirmed write and invalidates all trust/session variants only on that network', async () => {
    const queryClient = client();
    const get = vi.fn().mockResolvedValueOnce({ revision: 1 }).mockResolvedValue({ revision: 2 });
    const context = createSdkContextValue({ trusted: false, sdk: createMockSdk({ documents: { get } }) });
    const otherTrust = ['npe', 'testnet', true, 4, 'documents', 'get', 'contract', 'type', 'id'];
    const otherSession = ['npe', 'testnet', false, 8, 'identities', 'balanceAndRevision', 'id'];
    const otherNetwork = ['npe', 'mainnet', false, 1, 'documents', 'get', 'contract', 'type', 'id'];
    for (const key of [otherTrust, otherSession, otherNetwork]) queryClient.setQueryData(key, 'cached');
    function DocumentProbe() {
      const q = useDocument('contract', 'type', 'id');
      return <div data-testid="revision">{(q.data as { revision: number } | undefined)?.revision}</div>;
    }
    render(<Boundary client={queryClient} context={context}><DocumentProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('1'));
    await act(async () => { await invalidateNetworkQueries(queryClient, 'testnet'); });
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('2'));
    expect(queryClient.getQueryState(otherTrust)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherSession)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherNetwork)?.isInvalidated).toBe(false);
  });
});

describe('SDK session failures and pending sessions', () => {
  function CreditsCard() {
    const q = useTotalCreditsInPlatform();
    return <>
      <div data-testid="card">{q.isLoading ? 'loading' : q.isError ? `error:${q.error?.message}` : `data:${String(q.data)}`}</div>
      <div data-testid="proof">{q.proofState.kind}</div>
      <button onClick={() => { void q.refetch(); }}>Retry</button>
    </>;
  }

  it('shows the session error on cards instead of spinning, and Retry reconnects', async () => {
    const queryClient = client();
    const reconnect = vi.fn();
    const failed = createSdkContextValue({ sdk: null, status: 'error', error: new SdkSessionError('unreachable', 'Failed to prefetch quorums'), reconnect });
    render(<Boundary client={queryClient} context={failed}><CreditsCard /></Boundary>);
    expect(screen.getByTestId('card')).toHaveTextContent('error:Failed to prefetch quorums');
    expect(screen.getByTestId('proof')).toHaveTextContent('unavailable');
    fireEvent.click(screen.getByText('Retry'));
    expect(reconnect).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(getSdkQueryKey(failed, ['system', 'totalCreditsInPlatform']))?.status).toBe('pending');
  });

  it('keeps caller-disabled queries idle when the session fails', async () => {
    const queryClient = client();
    const failed = createSdkContextValue({ sdk: null, status: 'error', error: new Error('down') });
    function Disabled() {
      const q = useSdkQuery<string>(['disabled'], vi.fn(), { enabled: false });
      return <div data-testid="disabled">{q.status}:{String(q.isLoading)}</div>;
    }
    render(<Boundary client={queryClient} context={failed}><Disabled /></Boundary>);
    expect(screen.getByTestId('disabled')).toHaveTextContent('pending:false');
  });

  it('makes refetch a no-op while connecting instead of caching a "not ready" error', async () => {
    const queryClient = client();
    const fetch = vi.fn().mockResolvedValue({ data: 5 });
    const sdk = createMockSdk({ system: { totalCreditsInPlatformWithProof: fetch, totalCreditsInPlatform: vi.fn().mockResolvedValue(5) } });
    const pending = createSdkContextValue({ sdk: null, status: 'connecting' });
    const view = render(<Boundary client={queryClient} context={pending}><CreditsCard /></Boundary>);
    expect(screen.getByTestId('card')).toHaveTextContent('loading');
    await act(async () => { fireEvent.click(screen.getByText('Retry')); await Promise.resolve(); });
    const state = queryClient.getQueryState(getSdkQueryKey(pending, ['system', 'totalCreditsInPlatform']));
    expect(state?.error ?? null).toBeNull();
    expect(state?.fetchStatus).toBe('idle');
    expect(screen.getByTestId('card')).toHaveTextContent('loading');
    view.rerender(<Boundary client={queryClient} context={{ ...pending, sdk, status: 'ready' }}><CreditsCard /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('data:5'));
  });

  it('reports an exhausted DAPI address list to the provider and clears it on success', async () => {
    const queryClient = client();
    const reportUnreachable = vi.fn();
    const failure = new Error('Failed to get status: no available addresses to retry, last error: fetch failed');
    const status = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ chain: {} });
    const context = createSdkContextValue({ sessionId: 7, reportUnreachable, sdk: createMockSdk({ system: { status } }) });
    function StatusProbe() { const q = useSystemStatus(); return <><div data-testid="status">{q.status}</div><button onClick={() => { void q.refetch(); }}>Refresh</button></>; }
    const view = render(<Boundary client={queryClient} context={context}><StatusProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(reportUnreachable).toHaveBeenCalledWith(7, failure);
    const flagged = { ...context, unreachable: new Error('No DAPI endpoint answered') };
    view.rerender(<Boundary client={queryClient} context={flagged}><StatusProbe /></Boundary>);
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(reportUnreachable).toHaveBeenLastCalledWith(7, null);
  });

  it('turns a definite SDK not-found into a null result for not-found states', async () => {
    const queryClient = client();
    const notFound = Object.create({ get kind() { return 12; }, get name() { return 'TotalCreditsNotFound'; }, get message() { return 'total credits not found'; } });
    const sdk = createMockSdk({ system: {
      totalCreditsInPlatformWithProof: vi.fn().mockRejectedValue(notFound),
      totalCreditsInPlatform: vi.fn().mockRejectedValue(notFound),
    } });
    render(<Boundary client={queryClient} context={createSdkContextValue({ sdk })}><CreditsCard /><Probe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('data:null'));
    expect(sdk.system.totalCreditsInPlatform).not.toHaveBeenCalled();
  });

  it('keeps a missing dependency (generic NotFound) as an error, without fallback', async () => {
    const queryClient = client();
    const missing = Object.create({ get kind() { return 27; }, get name() { return 'NotFound'; }, get message() { return 'Data contract not found'; } });
    const sdk = createMockSdk({ system: {
      totalCreditsInPlatformWithProof: vi.fn().mockRejectedValue(missing),
      totalCreditsInPlatform: vi.fn().mockResolvedValue(1n),
    } });
    render(<Boundary client={queryClient} context={createSdkContextValue({ sdk })}><CreditsCard /><Probe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('error:NotFound: Data contract not found'));
    expect(screen.getByTestId('proof')).toHaveTextContent('unavailable');
    expect(sdk.system.totalCreditsInPlatform).not.toHaveBeenCalled();
  });

  it('keeps a transport gRPC NOT_FOUND retryable after the query normalizes it', async () => {
    const queryClient = client();
    const nodeNotFound = Object.create({ get kind() { return 6; }, get name() { return 'DapiClientError'; }, get message() { return "transport error: grpc error: code: 'Some requested entity was not found'"; } });
    const sdk = createMockSdk({ system: {
      totalCreditsInPlatformWithProof: vi.fn().mockRejectedValue(nodeNotFound),
      totalCreditsInPlatform: vi.fn().mockRejectedValue(nodeNotFound),
    } });
    function ReasonProbe() {
      const q = useTotalCreditsInPlatform();
      const reason = q.proofState.kind === 'unavailable' ? q.proofState.reason : q.proofState.kind;
      return <div data-testid="card">{q.isError ? `error:${reason}:${String(shouldRetrySdkQuery(0, q.error))}` : 'pending'}</div>;
    }
    render(<Boundary client={queryClient} context={createSdkContextValue({ sdk })}><ReasonProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('error:transport:true'));
    // A capture failure, not an absence: the ordinary method is tried too.
    expect(sdk.system.totalCreditsInPlatform).toHaveBeenCalledOnce();
  });

  it('returns a new result object instead of mutating React Query\'s tracked result', async () => {
    const queryClient = client();
    const results: unknown[] = [];
    function Capture() {
      const q = useTotalCreditsInPlatform();
      results.push(q);
      return <div data-testid="v">{String(q.data ?? '')}:{q.proofState.kind}</div>;
    }
    render(<Boundary client={queryClient} context={createSdkContextValue()}><Capture /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('100:verified'));
    const last = results.at(-1) as Record<string, unknown>;
    expect(last.proofState).toEqual(expect.objectContaining({ kind: 'verified' }));
    expect({ ...last }).toHaveProperty('proofState');
    const observerResult = queryClient.getQueryCache().getAll()[0]!.observers[0]!.getCurrentResult() as unknown as Record<string, unknown>;
    expect(observerResult).not.toHaveProperty('proofState');
  });
});

describe('paginated evonode blocks', () => {
  it('stops requesting pages from a retired session after a network switch', async () => {
    const queryClient = client();
    const first = deferred<Map<string, bigint>>();
    const page = new Map(Array.from({ length: 100 }, (_, i) => [i.toString(16).padStart(64, '0'), 1n]));
    const byRange = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(page);
    const controller = new AbortController();
    const context = createSdkContextValue({ sessionSignal: controller.signal, sdk: createMockSdk({ epoch: { evonodesProposedBlocksByRange: byRange } }) });
    function Blocks() { useAllEvonodeBlocksInEpoch(3); return null; }
    render(<Boundary client={queryClient} context={context}><Blocks /></Boundary>);
    await waitFor(() => expect(byRange).toHaveBeenCalledOnce());
    act(() => controller.abort());
    await act(async () => { first.resolve(page); await first.promise; await new Promise((r) => setTimeout(r, 0)); });
    expect(byRange).toHaveBeenCalledOnce();
  });
});
