'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Broadcast console"
      description="Opt-in write console covering every SDK write facade. Stage 6."
      stage={6}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Broadcast' }]}
    />
  );
}
