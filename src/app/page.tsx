'use client';

import { Placeholder } from '@ui/Placeholder';

export default function HomePage() {
  return (
    <Placeholder
      title="Native Platform Explorer"
      description="A proof-verified, client-only Dash Platform explorer. The home dashboard lands in Stage 3 — until then, every route is reachable from the navbar."
      stage={3}
    />
  );
}
