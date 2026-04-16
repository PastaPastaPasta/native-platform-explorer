'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ proTxHash: fromServer }: { proTxHash: string }) {
  const p = useParams<{ proTxHash: string }>();
  const proTxHash = p?.proTxHash ?? fromServer;
  return (
    <Placeholder
      title="Evonode"
      description={`Evonode ${proTxHash}. Stage 4 wires proposed-blocks-by-ids + protocol vote status.`}
      stage={4}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Evonode' }, { label: proTxHash }]}
      params={{ proTxHash }}
    />
  );
}
