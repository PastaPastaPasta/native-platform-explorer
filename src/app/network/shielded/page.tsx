'use client';

import { ShieldedPoolView } from '@components/network/ShieldedPoolView';
import { PageTitle } from '@components/layout/PageTitle';

export default function Page() {
  return (
    <>
      <PageTitle title="Shielded pool" />
      <ShieldedPoolView />
    </>
  );
}
