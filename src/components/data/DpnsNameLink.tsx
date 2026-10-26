'use client';

import { Alias } from './Alias';
import { usePrefetchProps } from '@hooks/usePrefetch';

/** A DPNS name linking to its /dpns page; hovering prefetches the resolution. */
export function DpnsNameLink({ fqdn, normalizedFqdn }: { fqdn: string; normalizedFqdn: string }) {
  const prefetch = usePrefetchProps({ kind: 'dpns', name: normalizedFqdn });
  return (
    <span {...prefetch}>
      <Alias name={fqdn} href={`/dpns/?name=${encodeURIComponent(normalizedFqdn)}`} />
    </span>
  );
}
