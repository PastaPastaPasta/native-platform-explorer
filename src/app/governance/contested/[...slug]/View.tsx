'use client';

import { useParams } from 'next/navigation';
import { Placeholder } from '@ui/Placeholder';

export default function View({ slug: fromServer }: { slug: string[] }) {
  const p = useParams<{ slug: string[] }>();
  const slug = p?.slug ?? fromServer;
  return (
    <Placeholder
      title="Contested resource"
      description={`Tally + voters for [${(slug ?? []).join(' / ')}]. Stage 4 wires voting.contestedResourceVoteState.`}
      stage={4}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Governance' },
        { label: 'Contested', href: '/governance/contested/' },
        { label: (slug ?? []).join('/') },
      ]}
      params={{ slug: slug as unknown as string }}
    />
  );
}
