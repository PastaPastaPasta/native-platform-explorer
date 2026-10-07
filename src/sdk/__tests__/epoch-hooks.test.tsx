import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { QueryProofStoreProvider, useQueryProofStore } from '@/contexts/QueryProofStore';
import { createTestQueryClient } from '@/test/render';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { SdkContext, type SdkContextValue } from '../SdkProvider';
import { useEpochInfo, useEpochRange, useFinalizedEpochInfo } from '../queries';

type EpochQuery = NonNullable<Parameters<EvoSDK['epoch']['epochsInfo']>[0]>;

function Boundary({ client, context, children }: {
  client: QueryClient; context: SdkContextValue; children: React.ReactNode;
}) {
  return <QueryClientProvider client={client}><SdkContext.Provider value={context}>
    <QueryProofStoreProvider>{children}</QueryProofStoreProvider>
  </SdkContext.Provider></QueryClientProvider>;
}

function Probe({ kind, index = 42 }: { kind: 'detail' | 'finalized' | 'range'; index?: number }) {
  const detail = useEpochInfo(kind === 'detail' ? index : undefined);
  const finalized = useFinalizedEpochInfo(kind === 'finalized' ? index : undefined);
  const range = useEpochRange(kind === 'range' ? 0 : undefined, kind === 'range' ? 24 : undefined);
  const q = kind === 'detail' ? detail : kind === 'finalized' ? finalized : range;
  const store = useQueryProofStore();
  return <>
    <div data-testid="state">{q.status}:{q.isLoading ? 'loading' : 'idle'}:{q.data instanceof Map ? [...q.data.keys()].join(',') : ''}</div>
    <div data-testid="evidence">{store.entries.length}:{String(!!store.entries[0]?.proof)}:{String(!!store.entries[0]?.metadata)}</div>
    <div data-testid="capture-note">{store.entries[0]?.captureNote}</div>
    <div data-testid="params">{JSON.stringify(store.entries[0]?.methodParams)}</div>
    <div data-testid="error">{q.error?.message}</div>
    <button onClick={() => { void q.refetch(); }}>Refetch</button>
  </>;
}

const clients: QueryClient[] = [];
function mountProbe(context: SdkContextValue, kind: 'detail' | 'finalized' | 'range', index?: number) {
  const client = createTestQueryClient();
  clients.push(client);
  return { client, ...render(<Boundary client={client} context={context}><Probe kind={kind} index={index} /></Boundary>) };
}
afterEach(() => { clients.forEach((client) => client.clear()); clients.length = 0; });

describe('epoch hook SDK arguments and capture', () => {
  it.each(['detail', 'finalized'] as const)('fetches exactly epoch 42 through %s proof transport', async (kind) => {
    const fetch = vi.fn().mockResolvedValue({ data: new Map([[42, {}]]) });
    const sdk = createMockSdk({ epoch: { epochsInfoWithProof: fetch, finalizedInfosWithProof: fetch } });
    mountProbe(createSdkContextValue({ sdk }), kind);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:42'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith({ startEpoch: 42, count: 1, ascending: true });
  });

  it('uses the same explicit input with ordinary transport when trust is off', async () => {
    const epochsInfo = vi.fn().mockResolvedValue(new Map([[42, {}]]));
    const epochsInfoWithProof = vi.fn();
    mountProbe(createSdkContextValue({ trusted: false, sdk: createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } }) }), 'detail');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:42'));
    expect(epochsInfo).toHaveBeenCalledWith({ startEpoch: 42, count: 1, ascending: true });
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, 65_280, 65_536])('does not send invalid epoch %s to either detail method', async (index) => {
    const fetch = vi.fn();
    mountProbe(createSdkContextValue({ sdk: createMockSdk({ epoch: { epochsInfoWithProof: fetch } }) }), 'detail', index);
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('pending:idle');
    await act(async () => { screen.getByRole('button', { name: 'Refetch' }).click(); });
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('whole numbers'));
  });

  it('records a complete paged history result without claiming one proof envelope or height', async () => {
    const epochsInfo = vi.fn((query: EpochQuery) => Promise.resolve(new Map(Array.from(
      { length: query.count! }, (_, i) => [query.startEpoch! + i, undefined],
    ))));
    const epochsInfoWithProof = vi.fn();
    mountProbe(createSdkContextValue({ sdk: createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:0,1,2,3,4,5,6,7,8,9,10'));
    expect(epochsInfo).toHaveBeenCalledTimes(3);
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
    expect(screen.getByTestId('evidence')).toHaveTextContent('1:false:false');
    expect(screen.getByTestId('capture-note')).toHaveTextContent('separate SDK-verified batches');
    expect(screen.getByTestId('params')).toHaveTextContent(JSON.stringify({
      requestedRange: { from: 0, to: 24 },
      plannedBatches: [
        { startEpoch: 0, count: 10, ascending: true },
        { startEpoch: 10, count: 10, ascending: true },
        { startEpoch: 20, count: 5, ascending: true },
      ],
    }));
  });

  it('does not launch another batch or record evidence after session cancellation', async () => {
    let resolve!: (value: Map<number, undefined>) => void;
    const first = new Promise<Map<number, undefined>>((done) => { resolve = done; });
    const epochsInfo = vi.fn().mockReturnValue(first);
    const controller = new AbortController();
    mountProbe(createSdkContextValue({
      sessionSignal: controller.signal, sdk: createMockSdk({ epoch: { epochsInfo } }),
    }), 'range');
    await waitFor(() => expect(epochsInfo).toHaveBeenCalledOnce());
    act(() => controller.abort());
    await act(async () => { resolve(new Map([[0, undefined]])); await first; });
    expect(epochsInfo).toHaveBeenCalledOnce();
    expect(screen.getByTestId('evidence')).toHaveTextContent('0:false:false');
    expect(screen.getByTestId('state')).not.toHaveTextContent('success');
  });

  it('records a failed batch without a completed result or success capture note', async () => {
    const epochsInfo = vi.fn().mockResolvedValueOnce(new Map([[0, undefined]]))
      .mockRejectedValue(new Error('Proof verification failed'));
    mountProbe(createSdkContextValue({ sdk: createMockSdk({ epoch: { epochsInfo } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:idle:'));
    expect(epochsInfo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('capture-note')).toBeEmptyDOMElement();
    expect(screen.getByTestId('error')).toHaveTextContent('Proof verification failed');
    expect(screen.getByTestId('evidence')).toHaveTextContent('1:false:false');
  });
});

describe('finalized record freshness', () => {
  it.each(['empty', 'undefined', 'record'] as const)('refreshes absence after remount but retains finalized records (%s)', async (kind) => {
    const exists = kind === 'record';
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetch = vi.fn().mockResolvedValueOnce({ data: exists ? new Map([[42, {}]]) : kind === 'undefined' ? new Map([[42, undefined]]) : new Map() })
      .mockResolvedValue({ data: new Map([[42, {}]]) });
    const context = createSdkContextValue({ sdk: createMockSdk({ epoch: { finalizedInfosWithProof: fetch } }) });
    try {
      const { client, unmount } = mountProbe(context, 'finalized');
      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle'));
      unmount();
      now += 31_000;
      render(<Boundary client={client} context={context}><Probe kind="finalized" /></Boundary>);
      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:42'));
      expect(fetch).toHaveBeenCalledTimes(exists ? 1 : 2);
    } finally { clock.mockRestore(); }
  });
});
