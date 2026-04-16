'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;
  return (
    <Placeholder
      title="Token holders (scoped)"
      description={`Seeded holder query for token ${id}. Stage 3 implements the seed-list UX.`}
      stage={3}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Tokens' },
        { label: id, href: `/token/${id}/` },
        { label: 'holders' },
      ]}
      params={{ id }}
    />
  );
}
