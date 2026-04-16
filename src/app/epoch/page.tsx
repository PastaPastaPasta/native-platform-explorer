'use client';

import { Placeholder } from '@ui/Placeholder';

export default function EpochPage() {
  return (
    <Placeholder
      title="Current epoch"
      description="Current epoch dashboard — index, progress, evonodes leaderboard. Stage 3."
      stage={3}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Epoch' }]}
    />
  );
}
