'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({
  id: fromServerId,
  type: fromServerType,
}: {
  id: string;
  type: string;
}) {
  const p = useParams<{ id: string; type: string }>();
  const id = p?.id ?? fromServerId;
  const type = p?.type ?? fromServerType;
  return (
    <Placeholder
      title="Documents"
      description={`Document list for ${type} within contract ${id}. Stage 3 implements filter/sort/pagination via documents.query.`}
      stage={3}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Contracts' },
        { label: id, href: `/contract/${id}/` },
        { label: type },
      ]}
      params={{ id, type }}
    />
  );
}
