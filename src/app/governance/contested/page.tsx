'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Contested resources"
      description="Scoped to a chosen contract via group.contestedResources. Stage 4."
      stage={4}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Governance' },
        { label: 'Contested' },
      ]}
    />
  );
}
