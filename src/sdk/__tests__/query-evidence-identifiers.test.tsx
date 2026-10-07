import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureInitialized, Identifier, Identity } from '@dashevo/evo-sdk';
import { useQueryProofStore } from '@contexts/QueryProofStore';
import { walkInstance } from '@util/wasm-json';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { serializeEvidenceBundle } from '../evidence';
import { useIdentity } from '../queries';

const BASE58_ID = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx';
const LARGE_INTEGER = 9007199254740993n;

function CaptureProbe({ expected }: { expected: unknown }) {
  const query = useIdentity('offline-serialization-fixture');
  const store = useQueryProofStore();
  return <>
    <div data-testid="query-status">{query.status}:{String(query.data === expected)}</div>
    <pre data-testid="evidence">{serializeEvidenceBundle(store.entries)}</pre>
  </>;
}

async function captureOffline(result: unknown) {
  // Only the transport is stubbed. Values are actual pinned SDK WASM classes;
  // trusted mode is off, so these offline tests claim no proof verification.
  const fetch = vi.fn().mockResolvedValue(result);
  const fetchWithProof = vi.fn();
  const sdk = createMockSdk({ identities: { fetch, fetchWithProof } });
  renderWithProviders(<CaptureProbe expected={result} />, { sdk: { sdk, trusted: false } });
  await waitFor(() => expect(screen.getByTestId('query-status')).toHaveTextContent('success:true'));
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetchWithProof).not.toHaveBeenCalled();
  const bundle = JSON.parse(screen.getByTestId('evidence').textContent!);
  expect(bundle.queries).toHaveLength(1);
  expect(bundle.queries[0].verification.outcome).toBe('not-verified');
  expect(bundle.queries[0].proof).toBeUndefined();
  return bundle.queries[0];
}

describe('offline native SDK identifier evidence', () => {
  beforeAll(async () => { await ensureInitialized(); });

  it('captures a native Identifier using its canonical JSON string', async () => {
    const identifier = new Identifier(new Uint8Array(32).fill(7));
    expect(identifier.toJSON()).toBe(BASE58_ID);
    const entry = await captureOffline(identifier);
    expect(entry.result).toBe(BASE58_ID);
    expect(entry.resultCaptureError).toBeUndefined();
  });

  it('retains the getter snapshot shape of a native Identity', async () => {
    const identity = new Identity(new Identifier(new Uint8Array(32).fill(7)));
    identity.balance = LARGE_INTEGER;
    identity.revision = 5n;
    const toJSON = vi.spyOn(identity, 'toJSON');
    const entry = await captureOffline(identity);
    expect(entry.result).toEqual({ id: BASE58_ID, balance: String(LARGE_INTEGER), revision: '5', publicKeys: [], __type: 'Identity' });
    expect(entry.resultCaptureError).toBeUndefined();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('preserves nested identifiers, getter fallback, getFoo, binary, bigint, Map, and Set', async () => {
    const identifier = new Identifier(new Uint8Array(32).fill(7));
    const identity = new Identity(identifier);
    class Wrapper {
      get nested() { return { a: { b: { c: { identifier, integer: LARGE_INTEGER, bytes: new Uint8Array([0, 255]) } } } }; }
      get unavailable() { throw new Error('unavailable getter'); }
      get __type() { throw new Error('unavailable type getter'); }
      getFoo() { return identifier; }
      getUnavailable() { throw new Error('unavailable method'); }
    }
    class MethodWrapper { getFoo() { return identity; } }
    const entry = await captureOffline({
      array: [identity, identifier],
      wrapper: new Wrapper(),
      deepMethod: { a: { b: { c: new MethodWrapper() } } },
      map: new Map<string, Identity | Identifier>([['identity', identity], ['identifier', identifier]]),
      set: new Set([identifier, identity]),
    });
    expect(entry.result.array[0].id).toBe(BASE58_ID);
    expect(entry.result.array[1]).toBe(BASE58_ID);
    expect(entry.result.wrapper).toEqual({ nested: { a: { b: { c: { identifier: BASE58_ID, integer: String(LARGE_INTEGER), bytes: '00ff' } } } }, foo: BASE58_ID });
    expect(entry.result.deepMethod.a.b.c.foo.id).toBe(BASE58_ID);
    expect(entry.result.map.identity.id).toBe(BASE58_ID);
    expect(entry.result.map.identifier).toBe(BASE58_ID);
    expect(entry.result.set[0]).toBe(BASE58_ID);
    expect(entry.result.set[1].id).toBe(BASE58_ID);
    expect(entry.resultCaptureError).toBeUndefined();
    // Other callers retain the existing opt-out getter-walking behavior.
    expect(walkInstance(identifier)).toEqual({ __type: 'Identifier' });
  });

  it('preserves the native all-zero Identifier representation', async () => {
    const identifier = new Identifier(new Uint8Array(32));
    expect((await captureOffline(identifier)).result).toBe('1'.repeat(32));
  });

  it.each(['getter', 'method'])('marks a throwing nested Identifier serializer without failing or retrying the query (%s)', async (shape) => {
    const identifier = new Identifier(new Uint8Array(32).fill(7));
    vi.spyOn(identifier, 'toJSON').mockImplementation(() => { throw new Error('native identifier serialization failed'); });
    class GetterWrapper { get value() { return identifier; } }
    class MethodWrapper { getValue() { return identifier; } }
    const entry = await captureOffline(shape === 'getter' ? new GetterWrapper() : new MethodWrapper());
    expect(entry.result).toBeUndefined();
    expect(entry.resultCaptureError).toBe('native identifier serialization failed');
  });

  it.each([undefined, null, {}, '', 42, '0'.repeat(32)])('marks an unusable Identifier serializer result: %s', async (unusable) => {
    const identifier = new Identifier(new Uint8Array(32).fill(7));
    vi.spyOn(identifier, 'toJSON').mockImplementation(() => unusable as string);
    const entry = await captureOffline({ array: [identifier] });
    expect(entry.result).toBeUndefined();
    expect(entry.resultCaptureError).toMatch(/Identifier.*canonical JSON string/);
  });
});
