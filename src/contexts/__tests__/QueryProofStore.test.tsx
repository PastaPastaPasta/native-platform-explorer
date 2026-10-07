import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createQueryProofStore, estimateProofEntryBytes, QueryProofStoreProvider,
  useQueryProofEntry, useQueryProofRecorder, useQueryProofStore,
  type QueryProofEntry, type QueryProofRecorder,
} from '../QueryProofStore';

function entry(result: unknown = 'small'): QueryProofEntry {
  return { queryKey: ['npe', 'testnet', true, 'identity'], methodName: 'identities.fetch', methodParams: {}, hasProofVariant: true, timestamp: 1000, durationMs: 10, status: 'success', result };
}

describe('proof recording budgets', () => {
  it('bounds entry count and moves updated queries to newest', () => {
    const store = createQueryProofStore({ maxEntries: 2, maxBytes: 10000 });
    store.recorder.record('a', entry());
    store.recorder.record('b', entry());
    store.recorder.record('a', entry('updated'));
    store.recorder.record('c', entry());
    expect(store.recorder.getEntry('b')).toBeUndefined();
    expect(store.getSnapshot().entries.map((e) => e.result)).toEqual(['small', 'updated']);
  });

  it('evicts old queries to honor the byte budget', () => {
    const bytes = estimateProofEntryBytes(entry()) + 2;
    const store = createQueryProofStore({ maxEntries: 200, maxBytes: bytes + 1 });
    store.recorder.record('a', entry());
    store.recorder.record('b', entry());
    expect(store.recorder.getEntry('a')).toBeUndefined();
    expect(store.getSnapshot().retainedBytes).toBeLessThanOrEqual(bytes + 1);
    expect(store.getSnapshot().entries).toHaveLength(1);
  });

  it('preserves provenance but marks oversized result and proof bytes as omitted', () => {
    const store = createQueryProofStore({ maxEntries: 200, maxBytes: 2000 });
    store.recorder.record('a', {
      ...entry('x'.repeat(3000)), network: 'testnet', trusted: true, verification: 'verified',
      proof: { grovedbProof: new Uint8Array(3000), quorumHash: new Uint8Array(), signature: new Uint8Array(), blockIdHash: new Uint8Array(), round: 0, quorumType: 106 },
    });
    expect(store.recorder.getEntry('a')).toMatchObject({ network: 'testnet', verification: 'verified', omitted: { result: true, proof: true, reason: 'storage-limit' } });
    expect(store.recorder.getEntry('a')?.proof).toBeUndefined();
    expect(store.getSnapshot().retainedBytes).toBeLessThanOrEqual(2000);
  });

  it('skips entries whose query parameters alone exceed the budget', () => {
    const store = createQueryProofStore({ maxEntries: 200, maxBytes: 2000 });
    store.recorder.record('a', entry('previous result'));
    store.recorder.record('a', { ...entry(), methodParams: { sql: 'x'.repeat(3000) } });
    expect(store.getSnapshot()).toMatchObject({ entries: [], retainedBytes: 0, droppedEntries: 1 });
  });

  it('counts data retained in maps, sets, and backing buffers', () => {
    expect(estimateProofEntryBytes(new Map([['value', 'x'.repeat(2000)]]))).toBeGreaterThan(4000);
    expect(estimateProofEntryBytes(new Set(['x'.repeat(2000)]))).toBeGreaterThan(4000);
    const buffer = new Uint8Array(4000);
    expect(estimateProofEntryBytes(buffer.subarray(0, 1))).toBeGreaterThanOrEqual(4000);
  });

  it('rejects delayed records after disable, re-enable, or clear', () => {
    const store = createQueryProofStore();
    const started = store.recorder.generation;
    store.recorder.setEnabled(false);
    store.recorder.record('a', entry(), started);
    store.recorder.setEnabled(true);
    store.recorder.record('b', entry(), started);
    expect(store.getSnapshot().entries).toHaveLength(0);
    const beforeClear = store.recorder.generation;
    store.recorder.clear();
    store.recorder.record('c', entry(), beforeClear);
    expect(store.getSnapshot().entries).toHaveLength(0);
    store.recorder.record('d', entry(), store.recorder.generation);
    expect(store.getSnapshot().entries).toHaveLength(1);
  });
});

it('keeps recorder consumers stable and only updates the matching entry subscriber', () => {
  const recorderRender = vi.fn();
  const entryRender = vi.fn();
  let recorder!: QueryProofRecorder;
  function Recorder() { recorderRender(); recorder = useQueryProofRecorder(); return null; }
  function Entry() { entryRender(); const e = useQueryProofEntry('a'); return <div>{e?.result as string ?? 'no entry'}</div>; }
  function Inspector() { const store = useQueryProofStore(); return <div data-testid="count">{store.entries.length}</div>; }
  render(<QueryProofStoreProvider><Recorder /><Entry /><Inspector /></QueryProofStoreProvider>);
  const initialRecorderRenders = recorderRender.mock.calls.length;
  const initialEntryRenders = entryRender.mock.calls.length;
  act(() => recorder.record('b', entry()));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(recorderRender).toHaveBeenCalledTimes(initialRecorderRenders);
  expect(entryRender).toHaveBeenCalledTimes(initialEntryRenders);
  act(() => recorder.record('a', entry('specific query')));
  expect(screen.getByText('specific query')).toBeInTheDocument();
  expect(recorderRender).toHaveBeenCalledTimes(initialRecorderRenders);
  expect(entryRender).toHaveBeenCalledTimes(initialEntryRenders + 1);
});
