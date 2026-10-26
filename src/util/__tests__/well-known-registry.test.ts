import { describe, expect, it, vi } from 'vitest';
import { BUNDLED_WELL_KNOWN, findWellKnown } from '@constants/well-known';
import {
  addLocalEntry,
  fetchRemoteRegistry,
  isCanonicalIdentifier,
  LOCAL_REGISTRY_KEY,
  MAX_REMOTE_BYTES,
  mergeRegistry,
  parseRegistryDocument,
  parseRegistryEntry,
  readLocalRegistry,
  RegistryError,
  writeLocalRegistry,
} from '../well-known-registry';

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const OTHER = 'Gz1ayo3EKKZTZrcgiqsoaAVMXaZUrv48YFzBVhP5jtJ6';

function response(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

describe('bundled registry', () => {
  it('holds only canonical identifiers, unique per network', () => {
    const keys = new Set<string>();
    for (const entry of BUNDLED_WELL_KNOWN) {
      expect(isCanonicalIdentifier(entry.id), entry.name).toBe(true);
      const key = `${entry.network ?? '*'}:${entry.id}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
  });

  it('includes tokens and identities for both public networks', () => {
    for (const network of ['mainnet', 'testnet']) {
      for (const kind of ['token', 'identity'] as const) {
        expect(BUNDLED_WELL_KNOWN.some((e) => e.kind === kind && e.network === network), `${network} ${kind}`).toBe(true);
      }
    }
  });

  it('scopes network-specific lookups', () => {
    expect(findWellKnown('DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd', 'mainnet')?.name).toBe('DUSD');
    expect(findWellKnown('DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd', 'testnet')).toBeUndefined();
    expect(findWellKnown(DPNS, 'testnet')?.name).toBe('DPNS');
  });
});

describe('registry validation', () => {
  it('rejects non-canonical identifiers', () => {
    expect(isCanonicalIdentifier(DPNS)).toBe(true);
    expect(isCanonicalIdentifier('1'.repeat(44))).toBe(false); // 44 ones is not 32 bytes
    expect(isCanonicalIdentifier(`${DPNS.slice(0, -1)}0`)).toBe(false);
  });

  it('parses a valid entry and normalises tags', () => {
    expect(parseRegistryEntry({ id: OTHER, kind: 'identity', name: ' Team ', tags: ['groups', 'groups'], network: 'testnet', url: 'https://example.org/x' }))
      .toEqual({ id: OTHER, kind: 'identity', name: 'Team', tags: ['groups'], network: 'testnet', url: 'https://example.org/x' });
  });

  it.each([
    [{ id: OTHER, kind: 'identity', name: 'x', extra: 1 }, /unsupported field "extra"/],
    [{ id: 'nope', kind: 'identity', name: 'x' }, /base58/],
    [{ id: OTHER, kind: 'wallet', name: 'x' }, /kind/],
    [{ id: OTHER, kind: 'token', name: '' }, /empty/],
    [{ id: OTHER, kind: 'token', name: 'a'.repeat(65) }, /longer than 64/],
    [{ id: OTHER, kind: 'token', name: 'evil‮name' }, /control characters/],
    [{ id: OTHER, kind: 'token', name: 'x', url: 'javascript:alert(1)' }, /https/],
    [{ id: OTHER, kind: 'token', name: 'x', url: 'http://example.org' }, /https/],
    [{ id: OTHER, kind: 'token', name: 'x', tags: ['UPPER'] }, /tags/],
    [{ id: OTHER, kind: 'token', name: 'x', network: 'Main Net' }, /network/],
  ])('rejects %j', (raw, message) => {
    expect(() => parseRegistryEntry(raw)).toThrow(message);
  });

  it('requires a versioned document and rejects it whole on any bad entry', () => {
    expect(parseRegistryDocument({ version: 1, entries: [{ id: OTHER, kind: 'identity', name: 'ok' }] })).toHaveLength(1);
    expect(() => parseRegistryDocument([])).toThrow(/JSON object/);
    expect(() => parseRegistryDocument({ version: 2, entries: [] })).toThrow(/version/);
    expect(() => parseRegistryDocument({ version: 1, entries: [{ id: OTHER, kind: 'identity', name: 'ok' }, { id: OTHER }] })).toThrow(/entries\[1\]/);
    expect(() => parseRegistryDocument({ version: 1, entries: [{ id: OTHER, kind: 'identity', name: 'a' }, { id: OTHER, kind: 'token', name: 'b' }] })).toThrow(/Duplicate/);
    expect(() => parseRegistryDocument({ version: 1, entries: Array(501).fill({}) })).toThrow(/more than 500/);
  });
});

describe('remote registry loading', () => {
  it('loads and validates a document', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(JSON.stringify({ version: 1, entries: [{ id: OTHER, kind: 'identity', name: 'Team' }] })));
    await expect(fetchRemoteRegistry('https://registry.example/wk.json', fetchImpl)).resolves.toEqual([{ id: OTHER, kind: 'identity', name: 'Team' }]);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' });
  });

  it('fails safe on HTTP errors, oversize bodies, bad JSON, plain HTTP and timeouts', async () => {
    await expect(fetchRemoteRegistry('https://r.example/a', vi.fn().mockResolvedValue(response('', { status: 404 })))).rejects.toThrow(/HTTP 404/);
    await expect(fetchRemoteRegistry('https://r.example/a', vi.fn().mockResolvedValue(response('{}', { headers: { 'content-length': String(MAX_REMOTE_BYTES + 1) } })))).rejects.toThrow(/larger than/);
    await expect(fetchRemoteRegistry('https://r.example/a', vi.fn().mockResolvedValue(response(' '.repeat(MAX_REMOTE_BYTES + 1))))).rejects.toThrow(/larger than/);
    await expect(fetchRemoteRegistry('https://r.example/a', vi.fn().mockResolvedValue(response('{nope')))).rejects.toThrow(/not valid JSON/);
    await expect(fetchRemoteRegistry('http://r.example/a', vi.fn())).rejects.toThrow(/https/);
    const hanging = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(fetchRemoteRegistry('https://r.example/a', hanging as unknown as typeof fetch, 5)).rejects.toThrow(RegistryError);
  });
});

describe('merging and local entries', () => {
  const bundled = [{ id: DPNS, kind: 'contract' as const, name: 'DPNS' }];
  const remote = [
    { id: DPNS, kind: 'contract' as const, name: 'Renamed' },
    { id: OTHER, kind: 'identity' as const, name: 'Remote team', network: 'testnet' },
  ];
  const local = [{ id: OTHER, kind: 'identity' as const, name: 'Mine', network: 'testnet' }];

  it('prefers bundled, then remote, then local entries for a network', () => {
    const merged = mergeRegistry({ bundled, remote, local }, 'testnet');
    expect(merged.map((e) => [e.name, e.source])).toEqual([['DPNS', 'bundled'], ['Remote team', 'remote']]);
    expect(mergeRegistry({ bundled, remote, local }, 'mainnet').map((e) => e.name)).toEqual(['DPNS']);
  });

  it('adds a validated local entry and refuses duplicates', () => {
    const existing = mergeRegistry({ bundled, remote: [], local: [] });
    expect(addLocalEntry([], { id: OTHER, kind: 'identity', name: 'Mine' }, existing)).toHaveLength(1);
    expect(() => addLocalEntry([], { id: DPNS, kind: 'contract', name: 'Again' }, existing)).toThrow(/already in the registry as "DPNS"/);
    expect(() => addLocalEntry([], { id: 'bad', kind: 'contract', name: 'x' }, existing)).toThrow(RegistryError);
  });

  it('round-trips local entries through storage and drops corrupted ones', () => {
    writeLocalRegistry(local);
    expect(readLocalRegistry()).toEqual(local);
    window.localStorage.setItem(LOCAL_REGISTRY_KEY, JSON.stringify([...local, { id: 'bad' }]));
    expect(readLocalRegistry()).toEqual(local);
    window.localStorage.setItem(LOCAL_REGISTRY_KEY, '{oops');
    expect(readLocalRegistry()).toEqual([]);
    writeLocalRegistry([]);
    expect(window.localStorage.getItem(LOCAL_REGISTRY_KEY)).toBeNull();
  });
});
