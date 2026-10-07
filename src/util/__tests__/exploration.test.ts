import { describe, expect, it, vi } from 'vitest';
import {
  clearSavedEntities,
  getSavedEntities,
  MAX_SAVED_ENTITIES,
  removeSavedEntity,
  saveEntity,
  savedEntityHref,
  shareUrl,
  subscribeSavedEntities,
  withNetwork,
} from '../exploration';

const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const entity = { kind: 'identity' as const, id, network: 'testnet' };

describe('network-aware exploration links', () => {
  it('updates network while preserving entity query and fragment', () => {
    const url = new URL(withNetwork(`/contract/document/?id=${id}&type=a%20b&docId=x&network=mainnet#data`, 'testnet'), 'https://example.org');
    expect(url.pathname).toBe('/contract/document/');
    expect(url.searchParams.get('type')).toBe('a b');
    expect(url.searchParams.getAll('network')).toEqual(['testnet']);
    expect(url.hash).toBe('#data');
  });

  it('shares the deployed base path instead of rebuilding a root-relative URL', () => {
    expect(shareUrl(`https://example.org/native-platform-explorer/identity/?id=${id}#keys`, 'mainnet'))
      .toBe(`https://example.org/native-platform-explorer/identity/?id=${id}&network=mainnet#keys`);
  });

  it('binds saved links to their recorded network', () => {
    expect(savedEntityHref(entity)).toBe(`/identity/?id=${id}&network=testnet`);
  });
});

describe('saved entity collection', () => {
  it.each([80, 81, 160])('round-trips an accepted custom network name of %i characters', (length) => {
    const network = `devnet-${'a'.repeat(length - 7)}`;
    const custom = { ...entity, network };
    saveEntity(custom);
    expect(getSavedEntities()).toMatchObject([custom]);
    const link = new URL(savedEntityHref(custom), 'https://example.org');
    expect(link.searchParams.get('network')).toBe(network);
    expect(link.searchParams.get('id')).toBe(id);
    removeSavedEntity(custom);
    expect(getSavedEntities()).toEqual([]);
    expect(localStorage.getItem('npe:savedEntities')).toBeNull();
  });

  it.each(['', 'Devnet', 'devnet name', '../devnet', 'devnet/name', 'devnet?name'])('rejects malformed network name %j', (network) => {
    const custom = { ...entity, network };
    expect(() => saveEntity(custom)).toThrow('This entity cannot be saved.');
    localStorage.setItem('npe:savedEntities', JSON.stringify([{ ...custom, savedAt: 1 }]));
    expect(getSavedEntities()).toEqual([]);
  });

  it('deduplicates within a network and keeps other networks and entity kinds separate', () => {
    saveEntity(entity);
    saveEntity(entity);
    saveEntity({ ...entity, network: 'mainnet' });
    saveEntity({ ...entity, kind: 'contract' });
    expect(getSavedEntities()).toHaveLength(3);
    removeSavedEntity(entity);
    expect(getSavedEntities().map((item) => `${item.network}:${item.kind}`)).toEqual(['testnet:contract', 'mainnet:identity']);
  });

  it('rejects malformed persisted data instead of rendering attacker-controlled links', () => {
    localStorage.setItem('npe:savedEntities', JSON.stringify([
      { ...entity, savedAt: 1 },
      { ...entity, savedAt: 1 },
      { ...entity, id: 'javascript:alert(1)', savedAt: 1 },
      { ...entity, kind: 'https://bad.test', savedAt: 1 },
      { ...entity, network: '../wrong', savedAt: 1 },
    ]));
    expect(getSavedEntities()).toEqual([{ ...entity, savedAt: 1 }]);
    localStorage.setItem('npe:savedEntities', '{invalid');
    expect(getSavedEntities()).toEqual([]);
  });

  it('reports the limit instead of silently deleting bookmarks', () => {
    for (let index = 0; index < MAX_SAVED_ENTITIES; index++) {
      saveEntity({ ...entity, network: `devnet-${index}` });
    }
    expect(() => saveEntity({ ...entity, network: 'mainnet' })).toThrow('Remove a saved item');
    expect(getSavedEntities()).toHaveLength(MAX_SAVED_ENTITIES);
  });

  it('notifies mounted views and other tabs on collection changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedEntities(listener);
    saveEntity(entity);
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: 'npe:savedEntities' }));
    expect(listener).toHaveBeenCalledTimes(2);
    clearSavedEntities();
    expect(localStorage.getItem('npe:savedEntities')).toBeNull();
    expect(getSavedEntities()).toEqual([]);
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: 'npe:savedEntities' }));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('surfaces storage write failures to the caller', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    expect(() => saveEntity(entity)).toThrow('Storage denied');
  });

  it('never overwrites or removes existing items after a failed storage read', () => {
    saveEntity(entity);
    const write = vi.spyOn(localStorage, 'setItem');
    const remove = vi.spyOn(localStorage, 'removeItem');
    const read = vi.spyOn(localStorage, 'getItem');
    read.mockImplementationOnce(() => { throw new Error('Read denied'); });
    expect(() => saveEntity({ ...entity, kind: 'contract', network: 'mainnet' })).toThrow('Read denied');
    expect(write).not.toHaveBeenCalled();
    expect(getSavedEntities()).toMatchObject([entity]);
    read.mockImplementationOnce(() => { throw new Error('Read denied'); });
    expect(() => removeSavedEntity(entity)).toThrow('Read denied');
    expect(remove).not.toHaveBeenCalled();
    expect(getSavedEntities()).toMatchObject([entity]);
  });
});
