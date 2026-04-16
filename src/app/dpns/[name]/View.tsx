'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ name: fromServer }: { name: string }) {
  const p = useParams<{ name: string }>();
  const name = p?.name ?? fromServer;
  return (
    <Placeholder
      title="DPNS record"
      description={`Resolution + status for "${name}". Stage 2 wires dpns.resolveName + getUsernameByName + availability.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'DPNS' }, { label: name }]}
      params={{ name }}
    />
  );
}
