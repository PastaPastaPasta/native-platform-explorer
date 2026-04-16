'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="About"
      description="What the Native Platform Explorer is, why it exists, how proofs work, and our privacy stance."
      stage={5}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
    />
  );
}
