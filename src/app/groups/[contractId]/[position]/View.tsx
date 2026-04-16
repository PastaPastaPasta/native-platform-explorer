'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({
  contractId: fromServerContract,
  position: fromServerPos,
}: {
  contractId: string;
  position: string;
}) {
  const p = useParams<{ contractId: string; position: string }>();
  const contractId = p?.contractId ?? fromServerContract;
  const position = p?.position ?? fromServerPos;
  return (
    <Placeholder
      title={`Group #${position}`}
      description={`Members, actions, action signers for group ${position} in contract ${contractId}. Stage 4.`}
      stage={4}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Groups' },
        { label: contractId, href: `/groups/${contractId}/` },
        { label: `#${position}` },
      ]}
      params={{ contractId, position }}
    />
  );
}
