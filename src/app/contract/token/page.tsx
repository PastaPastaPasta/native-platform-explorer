'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ParamsLanding } from '@ui/ParamsLanding';
import { identifierError, positionError } from '@util/identifier';
import { useSdk } from '@sdk/hooks';
import { TokenView } from '@components/token/TokenView';
import { usePageTitle } from '@hooks/usePageTitle';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const position = params.get('position') ?? '';
  usePageTitle(position ? `Token #${position}` : 'Token');
  const { sdk, status } = useSdk();
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // calculateId wraps out-of-range positions (-1 → 65535, 1.5 → 1), so only
  // whole u16 positions open a token.
  const valid = !!id && positionError(position) === null;

  useEffect(() => {
    if (!sdk || status !== 'ready' || !valid) return;
    void (async () => {
      try {
        const res = await sdk.tokens.calculateId(id, Number(position));
        setTokenId(String(res));
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [sdk, status, valid, id, position]);

  if (!valid) {
    return (
      <ParamsLanding
        title="Token by contract position"
        description="Opens a token from the data contract that defines it and its position in that contract. A contract page lists its tokens; a token ID alone opens from the token list."
        parent={id ? { label: 'Contract tokens', href: `/contract/?id=${encodeURIComponent(id)}&tab=tokens` } : { label: 'Token list', href: '/token/' }}
        fields={[
          { name: 'id', label: 'Contract ID', placeholder: '43–44 char base58 Identifier', initial: id, validate: identifierError },
          { name: 'position', label: 'Token position', placeholder: '0', initial: position, validate: positionError },
        ]}
        buildHref={(v) => `/contract/token/?id=${encodeURIComponent(v.id!)}&position=${v.position}`}
      />
    );
  }
  if (error) {
    return (
      <Container py={8}>
        <InfoBlock>Failed to compute token ID: {error.message}</InfoBlock>
      </Container>
    );
  }
  if (!tokenId) {
    return (
      <Container py={8}>
        <LoadingCard />
      </Container>
    );
  }
  return <TokenView tokenId={tokenId} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
