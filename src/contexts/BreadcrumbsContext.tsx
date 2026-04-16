'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();

  // Clear on route change so each page is responsible for its own trail.
  useEffect(() => {
    setItems([]);
  }, [pathname]);

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
