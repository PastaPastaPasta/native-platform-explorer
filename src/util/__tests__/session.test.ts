import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearViewedIdentities,
  getViewedIdentities,
  hasConsent,
  recordViewedIdentity,
  setConsent,
} from '../session';

// happy-dom's localStorage shim in this project is incomplete (missing
// clear/removeItem in the running version), so replace it with a plain
// Map-backed mock for deterministic tests.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: mock,
  });
}

describe('viewed identities log', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it('starts empty', () => {
    expect(getViewedIdentities()).toEqual([]);
  });

  it('does nothing without consent', () => {
    recordViewedIdentity('foo');
    expect(getViewedIdentities()).toEqual([]);
  });

  it('records ids after consent, most-recent first', () => {
    setConsent(true);
    expect(hasConsent()).toBe(true);
    recordViewedIdentity('a');
    recordViewedIdentity('b');
    recordViewedIdentity('c');
    expect(getViewedIdentities()).toEqual(['c', 'b', 'a']);
  });

  it('deduplicates and moves repeats to the front', () => {
    setConsent(true);
    recordViewedIdentity('a');
    recordViewedIdentity('b');
    recordViewedIdentity('a');
    expect(getViewedIdentities()).toEqual(['a', 'b']);
  });

  it('trims to 50', () => {
    setConsent(true);
    for (let i = 0; i < 60; i++) recordViewedIdentity(`id-${i}`);
    const list = getViewedIdentities();
    expect(list.length).toBe(50);
    expect(list[0]).toBe('id-59');
    expect(list[49]).toBe('id-10');
  });

  it('clear empties the store', () => {
    setConsent(true);
    recordViewedIdentity('foo');
    clearViewedIdentities();
    expect(getViewedIdentities()).toEqual([]);
  });
});
