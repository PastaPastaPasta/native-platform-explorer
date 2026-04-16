'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ index: fromServer }: { index: string }) {
  const p = useParams<{ index: string }>();
  const index = p?.index ?? fromServer;
  return (
    <Placeholder
      title={`Epoch ${index}`}
      description={`Historical epoch detail. Stage 3 wires epochsInfo + finalizedInfos + evonode blocks range.`}
      stage={3}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Epoch', href: '/epoch/' },
        { label: `#${index}` },
      ]}
      params={{ index }}
    />
  );
}
