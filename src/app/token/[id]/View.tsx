'use client';

import { useParams } from 'next/navigation';
import TokenView from './TokenView';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;
  return <TokenView tokenId={id} />;
}
