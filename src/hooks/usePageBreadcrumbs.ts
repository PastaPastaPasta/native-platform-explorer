'use client';

import { useEffect } from 'react';
import { useBreadcrumbs, type BreadcrumbItem } from '@contexts/BreadcrumbsContext';

/** Register a breadcrumb trail on mount. Trail clears automatically on navigation. */
export function usePageBreadcrumbs(items: BreadcrumbItem[]) {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items)]);
}
