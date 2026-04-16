'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Settings"
      description="Network, trusted mode, DAPI endpoints, cache size, well-known registry overrides. Stage 4/6."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
    />
  );
}
