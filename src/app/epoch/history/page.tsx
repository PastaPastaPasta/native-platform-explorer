'use client';

import { Placeholder } from '@ui/Placeholder';

export default function EpochHistoryPage() {
  return (
    <Placeholder
      title="Epoch history"
      description="Paginated epoch browser. Stage 3 implements via epoch.epochsInfo over an index range."
      stage={3}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Epoch', href: '/epoch/' },
        { label: 'History' },
      ]}
    />
  );
}
