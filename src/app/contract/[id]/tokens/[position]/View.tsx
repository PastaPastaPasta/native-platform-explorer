'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { useSdk } from '@sdk/hooks';
import TokenView from '@/app/token/[id]/TokenView';

export default function View({
  id: fromServerId,
  position: fromServerPos,
}: {
  id: string;
  position: string;
}) {
  const p = useParams<{ id: string; position: string }>();
  const id = p?.id ?? fromServerId;
  const position = p?.position ?? fromServerPos;
  const { sdk, status } = useSdk();
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sdk || status !== 'ready') return;
    if (id === 'placeholder') return;
    const posNum = Number(position);
    if (!Number.isFinite(posNum)) {
      setError(new Error(`Invalid token position "${position}".`));
      return;
    }
    void (async () => {
      try {
        const res = await sdk.tokens.calculateId(id, posNum);
        setTokenId(String(res));
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [sdk, status, id, position]);

  if (id === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          Provide a real contract id and token position in the URL.
        </InfoBlock>
      </Container>
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
