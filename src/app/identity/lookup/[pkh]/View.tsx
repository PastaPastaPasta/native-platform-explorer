'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ pkh: fromServer }: { pkh: string }) {
  const p = useParams<{ pkh: string }>();
  const pkh = p?.pkh ?? fromServer;
  return (
    <Placeholder
      title="Identity — reverse lookup"
      description={`Look up identity by public-key hash ${pkh}. Implemented in Stage 2 via identities.byPublicKeyHash.`}
      stage={2}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Identity lookup' },
        { label: pkh },
      ]}
      params={{ pkh }}
    />
  );
}
