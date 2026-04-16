'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Network — quorums"
      description="Active quorums: hash, type, size, threshold. Stage 4."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Quorums' }]}
    />
  );
}
