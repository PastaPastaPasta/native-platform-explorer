'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;
  return (
    <Placeholder
      title="Token"
      description={`Token ${id}. Supply, flags, price, and scoped holders land in Stage 2.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Tokens' }, { label: id }]}
      params={{ id }}
    />
  );
}
