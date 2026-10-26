'use client';

import { Suspense } from 'react';
import { LoadingCard } from '@ui/LoadingCard';
import { QueryPage } from '@components/query/QueryPage';
import { PageTitle } from '@components/layout/PageTitle';

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <PageTitle title="Query" />
      <QueryPage />
    </Suspense>
  );
}
