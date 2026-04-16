'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;
  return (
    <Placeholder
      title="Data contract"
      description={`Data contract ${id}. Stage 2 implements schema, types, tokens, groups, and history.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Contracts' }, { label: id }]}
      params={{ id }}
    />
  );
}
