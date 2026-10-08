import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewedIdentities } from '../useViewedIdentities';
import { recordViewedIdentity, setConsent } from '@util/session';

const KEY = 'npe:viewedIdentities';
const CONSENT_KEY = 'npe:viewedIdentitiesConsent';

function externalChange(key: string | null, value: string | null) {
  if (key === null) window.localStorage.clear();
  else if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}

describe('useViewedIdentities', () => {
  it('hydrates consented history and shares page-local changes between mounted consumers', () => {
    setConsent(true);
    recordViewedIdentity('initial');
    const first = renderHook(useViewedIdentities);
    const second = renderHook(useViewedIdentities);

    expect(first.result.current.ids).toEqual(['initial']);
    expect(second.result.current.consent).toBe(true);
    act(() => first.result.current.record('new'));
    expect(first.result.current.ids).toEqual(['new', 'initial']);
    expect(second.result.current.ids).toEqual(['new', 'initial']);

    act(() => first.result.current.setConsent(false));
    expect(first.result.current.consent).toBe(false);
    expect(second.result.current.consent).toBe(false);
    expect(first.result.current.ids).toEqual([]);
    expect(second.result.current.ids).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    act(() => second.result.current.setConsent(true));
    expect(first.result.current.ids).toEqual([]);
  });

  it('clears all mounted histories without disabling consent', () => {
    setConsent(true);
    recordViewedIdentity('initial');
    const first = renderHook(useViewedIdentities);
    const second = renderHook(useViewedIdentities);

    act(() => first.result.current.clear());

    expect(first.result.current.ids).toEqual([]);
    expect(second.result.current.ids).toEqual([]);
    expect(second.result.current.consent).toBe(true);
  });

  it('hides persisted history without consent', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['private-identity']));
    const { result } = renderHook(useViewedIdentities);

    expect(result.current.consent).toBe(false);
    expect(result.current.ids).toEqual([]);
  });

  it('updates all consumers on relevant cross-tab storage changes and browser-wide clearing', () => {
    const first = renderHook(useViewedIdentities);
    const second = renderHook(useViewedIdentities);

    act(() => externalChange(CONSENT_KEY, '1'));
    act(() => externalChange(KEY, JSON.stringify(['from-other-tab'])));
    expect(first.result.current.ids).toEqual(['from-other-tab']);
    expect(second.result.current.ids).toEqual(['from-other-tab']);

    act(() => externalChange(CONSENT_KEY, null));
    expect(first.result.current.ids).toEqual([]);
    expect(second.result.current.consent).toBe(false);

    act(() => externalChange(null, null));
    expect(first.result.current.consent).toBe(false);
    expect(second.result.current.ids).toEqual([]);
  });

  it('ignores unrelated storage updates and removes listeners when unmounted', () => {
    const { result, unmount } = renderHook(useViewedIdentities);
    const before = result.current;

    act(() => externalChange('another-feature', '1'));
    expect(result.current).toBe(before);

    const removeListener = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('npe:viewedIdentitiesChanged', expect.any(Function));
    removeListener.mockRestore();
  });

  it('revokes consent for all mounted consumers even when storage removal throws', () => {
    setConsent(true);
    recordViewedIdentity('private-identity');
    const first = renderHook(useViewedIdentities);
    const second = renderHook(useViewedIdentities);
    const remove = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    act(() => first.result.current.setConsent(false));

    expect(first.result.current.consent).toBe(false);
    expect(second.result.current.consent).toBe(false);
    expect(second.result.current.ids).toEqual([]);
    expect(first.result.current.error?.message).toContain('Could not erase history');
    remove.mockRestore();
    act(() => first.result.current.setConsent(true));
    expect(first.result.current.error).toBeNull();
  });

  it('reports a failed clear while hiding retained history in the current tab', () => {
    setConsent(true);
    recordViewedIdentity('private-identity');
    const { result } = renderHook(useViewedIdentities);
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    act(() => result.current.clear());

    expect(result.current.ids).toEqual([]);
    expect(result.current.error?.message).toContain('Could not erase saved history');
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it('reports a failed opt-in and keeps its action callbacks stable', () => {
    const { result, rerender } = renderHook(useViewedIdentities);
    const consentAction = result.current.setConsent;
    const clearAction = result.current.clear;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    act(() => result.current.setConsent(true));
    rerender();

    expect(result.current.consent).toBe(false);
    expect(result.current.error?.message).toContain('Could not enable identity history');
    expect(result.current.setConsent).toBe(consentAction);
    expect(result.current.clear).toBe(clearAction);
  });
});
