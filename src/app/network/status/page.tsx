'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Network — status"
      description="Height, chain id, versions, active quorums. Stage 4 wires system.status + currentQuorumsInfo."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Status' }]}
    />
  );
}
