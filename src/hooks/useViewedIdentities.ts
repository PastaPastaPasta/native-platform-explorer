'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearViewedIdentities,
  getViewedIdentities,
  hasConsent,
  recordViewedIdentity,
  setConsent,
  subscribeViewedIdentities,
} from '@util/session';

export function useViewedIdentities() {
  // Initial state must match SSR (which has no localStorage). Real values
  // land in state from the useEffect below on mount.
  const [{ ids, consent }, setState] = useState({ ids: [] as string[], consent: false });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const refresh = () => {
      const consent = hasConsent();
      setState({ consent, ids: consent ? getViewedIdentities() : [] });
    };
    const unsubscribe = subscribeViewedIdentities(refresh);
    refresh();
    return unsubscribe;
  }, []);

  const changeConsent = useCallback((consent: boolean): boolean => {
    const saved = setConsent(consent);
    setError(saved ? null : new Error(consent
      ? 'Could not enable identity history. Browser storage is unavailable.'
      : "Could not erase history and its preference from browser storage. Clear this site's browser data to remove them permanently."));
    return saved;
  }, []);

  const clear = useCallback((): boolean => {
    const cleared = clearViewedIdentities();
    setError(cleared ? null : new Error("Could not erase saved history from browser storage. Clear this site's browser data to remove it permanently."));
    return cleared;
  }, []);

  return {
    ids,
    consent,
    error,
    setConsent: changeConsent,
    record: recordViewedIdentity,
    clear,
  };
}
