'use client';

import { Suspense } from 'react';
import { LoadingCard } from '@ui/LoadingCard';
import { QueryPage } from '@components/query/QueryPage';

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <QueryPage />
    </Suspense>
  );
}
