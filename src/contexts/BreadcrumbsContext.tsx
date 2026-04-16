'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  avatarIdentifier?: string;
}

interface BreadcrumbsContextValue {
  items: BreadcrumbItem[];
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  reset: () => void;
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);

  // Note: we intentionally do NOT reset on pathname change. Each page calls
  // `usePageBreadcrumbs(newTrail)` in its own useEffect on mount, which
  // overwrites whatever was there. A pathname-reset effect caused a
  // setState cascade across parent/child during navigation that surfaced
  // as "Cannot update a component while rendering a different component".
  const setBreadcrumbs = useCallback((next: BreadcrumbItem[]) => setItems(next), []);
  const reset = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, setBreadcrumbs, reset }),
    [items, setBreadcrumbs, reset],
  );

  return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>;
}

export function useBreadcrumbs(): BreadcrumbsContextValue {
  const ctx = useContext(BreadcrumbsContext);
  if (!ctx) throw new Error('useBreadcrumbs must be used within <BreadcrumbsProvider>.');
  return ctx;
}
