'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Vote polls"
      description="Polls by end date — voting.votePollsByEndDate. Stage 4."
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Governance' }, { label: 'Polls' }]}
    />
  );
}
