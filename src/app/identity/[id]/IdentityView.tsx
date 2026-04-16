'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function IdentityView({ id: fromServer }: { id: string }) {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id ?? fromServer;
  return (
    <Placeholder
      title="Identity"
      description={`Identity detail for ${id}. Full view (keys, balance, DPNS, votes, groups) lands in Stage 2.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Identity' }, { label: id }]}
      params={{ id }}
    />
  );
}
