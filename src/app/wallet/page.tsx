'use client';

import { Placeholder } from '@ui/Placeholder';

export default function Page() {
  return (
    <Placeholder
      title="Wallet"
      description="Ephemeral signer setup: browser extension, mnemonic paste, WIF. Never persisted. Stage 6."
      stage={6}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Wallet' }]}
    />
  );
}
