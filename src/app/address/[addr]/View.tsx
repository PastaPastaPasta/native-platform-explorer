'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ addr: fromServer }: { addr: string }) {
  const p = useParams<{ addr: string }>();
  const addr = p?.addr ?? fromServer;
  return (
    <Placeholder
      title="Address"
      description={`Platform address ${addr}. Balance + nonce land in Stage 2 via addresses.get.`}
      stage={2}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Address' }, { label: addr }]}
      params={{ addr }}
    />
  );
}
