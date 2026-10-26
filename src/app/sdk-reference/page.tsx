'use client';

import { SdkReference } from '@components/sdk-reference/SdkReference';
import { PageTitle } from '@components/layout/PageTitle';

export default function Page() {
  return (
    <>
      <PageTitle title="SDK reference" />
      <SdkReference />
    </>
  );
}
