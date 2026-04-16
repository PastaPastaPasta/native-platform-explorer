'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingCard } from '@ui/LoadingCard';
import { TokenView } from '@components/token/TokenView';
import { TokenLanding } from '@components/token/TokenLanding';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  if (!id) return <TokenLanding />;
  return <TokenView tokenId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
