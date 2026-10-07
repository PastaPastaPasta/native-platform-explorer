import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { QueryProofStoreProvider, useQueryProofStore } from '@/contexts/QueryProofStore';
import { createTestQueryClient } from '@/test/render';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { SdkContext, type SdkContextValue } from '../SdkProvider';
import { useCurrentEpoch, useEpochInfo, useEpochRange, useFinalizedEpochInfo } from '../queries';
import { createEvidenceBundle } from '../evidence';
import { nativeProofError, SDK_PROOF_CONTEXT_MESSAGE, SDK_PROOF_DECODE_MESSAGE } from '@/test/proof-errors';
import { normalizeError } from '../errors';

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
    <div data-testid="proof-state">{q.proofState.kind}</div>
    <div data-testid="export">{JSON.stringify(createEvidenceBundle(store.entries).queries[0])}</div>
    <div data-testid="error">{q.error?.message}</div>
    <button onClick={() => { void q.refetch(); }}>Refetch</button>
    <button onClick={() => store.setEnabled(false)}>Disable inspector</button>
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
  it.each(['raw', 'normalized', 'wrapped'])('exports actual trusted-off WASM context unavailability without fallback (%s)', async (shape) => {
    const native = nativeProofError(SDK_PROOF_CONTEXT_MESSAGE);
    const error = shape === 'raw' ? native : shape === 'normalized' ? normalizeError(native) : new Error('Epoch read failed', { cause: native });
    const epochsInfo = vi.fn().mockRejectedValue(error);
    const epochsInfoWithProof = vi.fn();
    mountProbe(createSdkContextValue({ trusted: false, sdk: createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:idle:'));
    expect(screen.getByTestId('proof-state')).toHaveTextContent('unavailable');
    expect(epochsInfo).toHaveBeenCalledOnce();
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
    const evidence = JSON.parse(screen.getByTestId('export').textContent!);
    expect(evidence.context).toMatchObject({ trustedMode: false });
    expect(evidence.verification.outcome).toBe('unavailable');
    expect(evidence.verification).not.toHaveProperty('captureNote');
    expect(evidence).not.toHaveProperty('result');
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
  });

  it.each([true, false])('exports aggregate success with its actual trust outcome and limitation (trusted=%s)', async (trusted) => {
    const epochsInfo = vi.fn((query: EpochQuery) => Promise.resolve(new Map([[query.startEpoch!, { blockHeight: 100n }]])));
    const epochsInfoWithProof = vi.fn();
    mountProbe(createSdkContextValue({ trusted, sdk: createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:0,10,20'));
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
    expect(screen.getByTestId('proof-state')).toHaveTextContent(trusted ? 'verified' : 'unverified-trusted-off');
    const evidence = JSON.parse(screen.getByTestId('export').textContent!);
    expect(evidence.verification).toMatchObject({
      outcome: trusted ? 'verified' : 'not-verified',
      proofAvailability: 'not-captured',
      captureNote: `Combined results from separate ${trusted ? 'SDK-verified batches' : 'SDK calls'}. No single proof payload or response height covers this range.`,
    });
    expect(evidence.context).toMatchObject({ network: 'testnet', trustedMode: trusted });
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
    expect(evidence.result).toEqual({ 0: { blockHeight: '100' }, 10: { blockHeight: '100' }, 20: { blockHeight: '100' } });
  });

  it.each([
    ['invalid quorum signature', 'failed'],
    [SDK_PROOF_DECODE_MESSAGE, 'unavailable'],
  ])('exports a failed native range read without a success note or retry: %s', async (message, outcome) => {
    const epochsInfo = vi.fn().mockRejectedValue(new Error('Epoch read failed', { cause: nativeProofError(message) }));
    const epochsInfoWithProof = vi.fn();
    mountProbe(createSdkContextValue({ sdk: createMockSdk({ epoch: { epochsInfo, epochsInfoWithProof } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:idle:'));
    expect(epochsInfo).toHaveBeenCalledOnce();
    expect(epochsInfoWithProof).not.toHaveBeenCalled();
    expect(screen.getByTestId('proof-state')).toHaveTextContent(outcome);
    const evidence = JSON.parse(screen.getByTestId('export').textContent!);
    expect(evidence.verification.outcome).toBe(outcome);
    expect(evidence.verification).not.toHaveProperty('captureNote');
    expect(evidence).not.toHaveProperty('result');
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
  });

  it('still completes bounded internal SDK reads without capturing evidence when the inspector is disabled', async () => {
    const epochsInfo = vi.fn((query: EpochQuery) => Promise.resolve(new Map([[query.startEpoch!, undefined]])));
    mountProbe(createSdkContextValue({ sdk: createMockSdk({ epoch: { epochsInfo } }) }), 'range');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:idle:0,10,20'));
    await act(async () => { screen.getByRole('button', { name: 'Disable inspector' }).click(); });
    await act(async () => { screen.getByRole('button', { name: 'Refetch' }).click(); });
    await waitFor(() => expect(epochsInfo).toHaveBeenCalledTimes(6));
    expect(screen.getByTestId('state')).toHaveTextContent('success:idle:0,10,20');
    expect(screen.getByTestId('proof-state')).toHaveTextContent('verified');
    expect(screen.getByTestId('evidence')).toHaveTextContent('0:false:false');
  });

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

function CurrentProbe() {
  const q = useCurrentEpoch();
  const store = useQueryProofStore();
  return <>
    <div data-testid="current-state">{q.status}</div>
    <div data-testid="current-result">{JSON.stringify(q.data)}</div>
    <div data-testid="current-proof">{String(!!store.entries[0]?.proof)}:{String(!!store.entries[0]?.metadata)}</div>
    <div data-testid="current-note">{store.entries[0]?.captureNote}</div>
    <div data-testid="current-count">{store.entries.length}</div>
    <div data-testid="current-network">{store.entries[0]?.queryKey[1] as string}</div>
    <div data-testid="current-proof-state">{q.proofState.kind}</div>
    <div data-testid="current-export">{JSON.stringify(createEvidenceBundle(store.entries).queries)}</div>
  </>;
}

describe('current epoch selection integrity', () => {
  it('never uses implicit current or its unsigned metadata epoch to select the latest result', async () => {
    const genesisTime = 1;
    const timeMs = genesisTime + 84 * 788_400_000 + 1;
    const epochsInfoWithProof = vi.fn((query: EpochQuery) => Promise.resolve({ proof: {}, metadata: { timeMs, epoch: 42 }, data: new Map(
      [0, 42, 84].filter((index) => index >= query.startEpoch!)
        .slice(0, query.count).map((index) => [index, {
          index, firstBlockTime: genesisTime + index * 788_400_000, firstBlockHeight: 1, firstCoreBlockHeight: 1,
          feeMultiplierPermille: 1000, protocolVersion: 13,
        }]),
    ) }));
    const current = vi.fn().mockResolvedValue({ index: 42 });
    const currentWithProof = vi.fn().mockResolvedValue({ data: { index: 42 }, metadata: { epoch: 42 } });
    const client = createTestQueryClient();
    clients.push(client);
    render(<Boundary client={client} context={createSdkContextValue({
      network: 'mainnet', sdk: createMockSdk({ epoch: { epochsInfoWithProof, current, currentWithProof } }),
    })}><CurrentProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('current-state')).toHaveTextContent('success'));
    expect(screen.getByTestId('current-result')).toHaveTextContent('"index":84');
    expect(current).not.toHaveBeenCalled();
    expect(currentWithProof).not.toHaveBeenCalled();
    expect(epochsInfoWithProof.mock.calls.every(([query]) => Number.isInteger(query.startEpoch) && query.ascending === true)).toBe(true);
    expect(screen.getByTestId('current-proof')).toHaveTextContent('false:false');
    expect(screen.getByTestId('current-note')).toHaveTextContent('No single proof payload or response height');
  });

  it('does not publish the previous network after retirement during the selected epoch request', async () => {
    const data = (index: number, firstBlockTime: number) => ({
      index, firstBlockTime, firstBlockHeight: 1, firstCoreBlockHeight: 1,
      feeMultiplierPermille: 1000, protocolVersion: 13,
    });
    const oldTime = 84 * 788_400_000 + 1;
    let resolveOld!: (value: unknown) => void;
    const oldResponse = new Promise((done) => { resolveOld = done; });
    const mainnetFetch = vi.fn().mockResolvedValueOnce({
      data: new Map([[0, data(0, 0)]]), metadata: { timeMs: oldTime }, proof: {},
    }).mockReturnValueOnce(oldResponse);
    const testnetFetch = vi.fn((query: EpochQuery) => Promise.resolve({
      data: new Map([[query.startEpoch!, data(query.startEpoch!, query.startEpoch! * 3_600_000)]]),
      metadata: { timeMs: 2 * 3_600_000 + 1 }, proof: {},
    }));
    const controller = new AbortController();
    const client = createTestQueryClient();
    clients.push(client);
    const view = render(<Boundary client={client} context={createSdkContextValue({
      network: 'mainnet', sessionSignal: controller.signal,
      sdk: createMockSdk({ epoch: { epochsInfoWithProof: mainnetFetch } }),
    })}><CurrentProbe /></Boundary>);
    await waitFor(() => expect(mainnetFetch).toHaveBeenCalledTimes(2));
    act(() => controller.abort());
    view.rerender(<Boundary client={client} context={createSdkContextValue({
      network: 'testnet', sessionId: 2,
      sdk: createMockSdk({ epoch: { epochsInfoWithProof: testnetFetch } }),
    })}><CurrentProbe /></Boundary>);
    await waitFor(() => expect(screen.getByTestId('current-result')).toHaveTextContent('"index":2'));
    await act(async () => {
      resolveOld({ data: new Map([[84, data(84, oldTime - 1)]]), metadata: { timeMs: oldTime }, proof: {} });
      await oldResponse;
    });
    expect(screen.getByTestId('current-result')).toHaveTextContent('"index":2');
    expect(screen.getByTestId('current-count')).toHaveTextContent('1');
    expect(screen.getByTestId('current-network')).toHaveTextContent('testnet');
    expect(screen.getByTestId('current-proof-state')).toHaveTextContent('verified');
    const exported = JSON.parse(screen.getByTestId('current-export').textContent!);
    expect(exported).toHaveLength(1);
    expect(exported[0].context).toMatchObject({ network: 'testnet', trustedMode: true });
    expect(exported[0].result.index).toBe(2);
    expect(exported[0].verification).toMatchObject({ outcome: 'verified', captureNote: expect.stringContaining('No single proof payload or response height') });
    expect(exported[0]).not.toHaveProperty('proof');
    expect(exported[0]).not.toHaveProperty('metadata');
    expect(testnetFetch.mock.calls.map(([query]) => query.startEpoch)).toEqual([0, 2]);
  });
});
