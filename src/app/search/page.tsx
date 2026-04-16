'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Placeholder } from '@ui/Placeholder';

function SearchContent() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <Placeholder
      title="Search"
      description={`Disambiguation for "${q || '...'}". Full search logic is implemented in Stage 2.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Search' }]}
      params={{ q }}
    />
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchContent />
    </Suspense>
  );
}
