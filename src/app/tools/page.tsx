'use client';

import { Suspense } from 'react';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { ToolShell } from '@components/tools/ToolShell';

function Content() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Tools' }]);
  return <ToolShell />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
