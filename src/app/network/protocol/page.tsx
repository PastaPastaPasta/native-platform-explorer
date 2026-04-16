'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Network — protocol"
      description="Protocol version upgrade state + per-masternode vote (paged). Stage 4."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Protocol' }]}
    />
  );
}
