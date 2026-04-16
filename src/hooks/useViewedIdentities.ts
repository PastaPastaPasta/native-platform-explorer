'use client';

import { useEffect, useState } from 'react';
import { getViewedIdentities, hasConsent, recordViewedIdentity, setConsent } from '@util/session';

export function useViewedIdentities() {
  // Initial state must match SSR (which has no localStorage). Real values
  // land in state from the useEffect below on mount.
  const [ids, setIds] = useState<string[]>([]);
  const [consent, setConsentState] = useState<boolean>(false);

  useEffect(() => {
    setIds(getViewedIdentities());
    setConsentState(hasConsent());
  }, []);

  return {
    ids,
    consent,
    setConsent: (c: boolean) => {
      setConsent(c);
      setConsentState(c);
      if (!c) setIds([]);
    },
    record: (id: string) => {
      const next = recordViewedIdentity(id);
      setIds(next);
    },
  };
}
