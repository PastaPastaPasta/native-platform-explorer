'use client';

import { usePageTitle } from '@hooks/usePageTitle';

/** `usePageTitle` for pages without a client component body of their own. */
export function PageTitle({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}
