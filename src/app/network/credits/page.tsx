'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Network — credits"
      description="Total credits on Platform + prefunded specialised balance lookup. Stage 4."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Credits' }]}
    />
  );
}
