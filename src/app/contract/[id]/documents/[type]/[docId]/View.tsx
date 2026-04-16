'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({
  id: fromServerId,
  type: fromServerType,
  docId: fromServerDocId,
}: {
  id: string;
  type: string;
  docId: string;
}) {
  const p = useParams<{ id: string; type: string; docId: string }>();
  const id = p?.id ?? fromServerId;
  const type = p?.type ?? fromServerType;
  const docId = p?.docId ?? fromServerDocId;
  return (
    <Placeholder
      title="Document"
      description={`Document ${docId} of type ${type} in contract ${id}. Stage 2 implements via documents.get.`}
      stage={2}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Contracts' },
        { label: id, href: `/contract/${id}/` },
        { label: type, href: `/contract/${id}/documents/${type}/` },
        { label: docId },
      ]}
      params={{ id, type, docId }}
    />
  );
}
