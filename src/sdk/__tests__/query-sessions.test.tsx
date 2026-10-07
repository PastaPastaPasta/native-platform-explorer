import React, { type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SdkContext, type SdkContextValue } from '../SdkProvider';
import { getSdkQueryKey, invalidateNetworkQueries, useSdkQuery } from '../hooks';
import { useDocument, useDocumentsQuery, useDocumentsAggregate, useSystemStatus, useTotalCreditsInPlatform } from '../queries';
import { QueryProofStoreProvider, useQueryProofStore } from '@/contexts/QueryProofStore';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { createTestQueryClient } from '@/test/render';

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

describe('SDK freshness policies', () => {
  it.each(['documents', 'aggregate'] as const)('isolates repeated %s executions with unchanged inputs', async (kind) => {
    const queryClient = client();
    const firstResponse = deferred<never>();
    const fetch = vi.fn().mockReturnValueOnce(firstResponse.promise).mockResolvedValue(kind === 'documents' ? ['second run'] : new Map([['count', 2n]]));
    const context = createSdkContextValue({ trusted: false, sdk: createMockSdk({
      documents: { query: fetch },
      getWasmSdkConnected: vi.fn().mockResolvedValue({ getDocumentsCount: fetch }),
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
