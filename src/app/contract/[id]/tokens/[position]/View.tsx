'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({
  id: fromServerId,
  position: fromServerPos,
}: {
  id: string;
  position: string;
}) {
  const p = useParams<{ id: string; position: string }>();
  const id = p?.id ?? fromServerId;
  const position = p?.position ?? fromServerPos;
  return (
    <Placeholder
      title="Token"
      description={`Token at position ${position} of contract ${id}. Canonicalised with /token/[id] in Stage 2.`}
      stage={2}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Contracts' },
        { label: id, href: `/contract/${id}/` },
        { label: `token #${position}` },
      ]}
      params={{ id, position }}
    />
  );
}
