'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ contractId: fromServer }: { contractId: string }) {
  const p = useParams<{ contractId: string }>();
  const contractId = p?.contractId ?? fromServer;
  return (
    <Placeholder
      title="Groups"
      description={`All groups defined in contract ${contractId}. Stage 4 via group.infos.`}
      stage={4}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Groups' },
        { label: contractId },
      ]}
      params={{ contractId }}
    />
  );
}
