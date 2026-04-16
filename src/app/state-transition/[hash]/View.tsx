'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ hash: fromServer }: { hash: string }) {
  const p = useParams<{ hash: string }>();
  const hash = p?.hash ?? fromServer;
  return (
    <Placeholder
      title="State transition"
      description={`Result lookup for ${hash}. Stage 6 wires waitForStateTransitionResult.`}
      stage={6}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'State transition' },
        { label: hash },
      ]}
      params={{ hash }}
    />
  );
}
