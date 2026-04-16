'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="SDK reference"
      description="Which SDK call powers each page. Stage 5/6 populates this from a generated mapping."
      stage={5}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'SDK reference' }]}
    />
  );
}
