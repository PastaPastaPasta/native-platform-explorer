import { describe, expect, it, vi } from 'vitest';
import { installStorageMock } from '@/test/storage';
import {
  clearViewedIdentities,
  getViewedIdentities,
  hasConsent,
  recordViewedIdentity,
  setConsent,
} from '../session';

describe('viewed identities log', () => {
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
    expect(hasConsent()).toBe(true);
  });

  it('revocation deletes persisted history and a later opt-in starts empty', () => {
    setConsent(true);
    recordViewedIdentity('private-identity');

    setConsent(false);

    expect(hasConsent()).toBe(false);
    expect(window.localStorage.getItem('npe:viewedIdentities')).toBeNull();
    expect(window.localStorage.getItem('npe:viewedIdentitiesConsent')).toBeNull();
    setConsent(true);
    expect(getViewedIdentities()).toEqual([]);
  });

  it('does not opt in if stale history cannot be erased first', () => {
    window.localStorage.setItem('npe:viewedIdentities', JSON.stringify(['stale']));
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(setConsent(true)).toBe(false);
    expect(hasConsent()).toBe(false);
    expect(getViewedIdentities()).toEqual([]);
    expect(window.localStorage.getItem('npe:viewedIdentitiesConsent')).toBeNull();
  });

  it('never exposes stale history without consent, including on a fresh opt-in', () => {
    window.localStorage.setItem('npe:viewedIdentities', JSON.stringify(['stale']));

    expect(getViewedIdentities()).toEqual([]);
    expect(recordViewedIdentity('unconsented')).toEqual([]);
    setConsent(true);
    expect(getViewedIdentities()).toEqual([]);
  });

  it('handles malformed persisted history', () => {
    setConsent(true);
    window.localStorage.setItem('npe:viewedIdentities', '{broken');
    expect(getViewedIdentities()).toEqual([]);
    recordViewedIdentity('new');
    expect(getViewedIdentities()).toEqual(['new']);
    window.localStorage.setItem('npe:viewedIdentities', JSON.stringify([12, null, 'a']));
    expect(getViewedIdentities()).toEqual(['a']);
  });

  it('keeps revocation private when storage refuses removals', () => {
    setConsent(true);
    recordViewedIdentity('private-identity');
    const remove = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(setConsent(false)).toBe(false);
    expect(hasConsent()).toBe(false);
    expect(getViewedIdentities()).toEqual([]);
    expect(recordViewedIdentity('another')).toEqual([]);
    remove.mockRestore();
    setConsent(true);
    expect(getViewedIdentities()).toEqual([]);
  });

  it('keeps cleared history hidden when storage refuses removals', () => {
    setConsent(true);
    recordViewedIdentity('private-identity');
    const remove = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(clearViewedIdentities()).toBe(false);
    expect(getViewedIdentities()).toEqual([]);
    expect(hasConsent()).toBe(true);
    recordViewedIdentity('new-identity');
    expect(getViewedIdentities()).toEqual(['new-identity']);
    remove.mockRestore();
  });

  it('does not enable recording if an opt-in cannot be saved', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(setConsent(true)).toBe(false);
    expect(hasConsent()).toBe(false);
    expect(recordViewedIdentity('private-identity')).toEqual([]);
  });

  it('keeps existing history if a new record cannot be saved', () => {
    setConsent(true);
    recordViewedIdentity('saved');
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(recordViewedIdentity('unsaved')).toEqual(['saved']);
    expect(getViewedIdentities()).toEqual(['saved']);
  });

  it('does not overwrite existing history when its storage read fails', () => {
    setConsent(true);
    recordViewedIdentity('saved');
    const get = localStorage.getItem.bind(localStorage);
    const write = vi.spyOn(localStorage, 'setItem');
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'npe:viewedIdentities') throw new Error('Read blocked');
      return get(key);
    });
    expect(recordViewedIdentity('new')).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    read.mockRestore();
    expect(getViewedIdentities()).toEqual(['saved']);
  });

  it('handles storage reads and storage access being blocked', () => {
    const ls = installStorageMock('localStorage');
    vi.spyOn(ls, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(hasConsent()).toBe(false);
    expect(getViewedIdentities()).toEqual([]);

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked');
      },
    });
    expect(() => setConsent(true)).not.toThrow();
    expect(() => setConsent(false)).not.toThrow();
    expect(() => clearViewedIdentities()).not.toThrow();
    expect(hasConsent()).toBe(false);
    expect(recordViewedIdentity('private-identity')).toEqual([]);
  });
});
