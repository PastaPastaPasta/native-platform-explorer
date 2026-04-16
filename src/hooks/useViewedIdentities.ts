'use client';

import { useEffect, useState } from 'react';
import { getViewedIdentities, hasConsent, recordViewedIdentity, setConsent } from '@util/session';

export function useViewedIdentities() {
  const [ids, setIds] = useState<string[]>(() => getViewedIdentities());
  const [consent, setConsentState] = useState<boolean>(() => hasConsent());

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
