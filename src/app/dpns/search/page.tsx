'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

function Content() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <Placeholder
      title="DPNS search"
      description={`Prefix search on DPNS labels for "${q}". Stage 2 wires dpns.usernames.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'DPNS' }, { label: 'Search' }]}
      params={{ q }}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
