'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { useSdk } from '@sdk/hooks';
import { TokenView } from '@components/token/TokenView';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const position = params.get('position') ?? '';
  const { sdk, status } = useSdk();
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sdk || status !== 'ready' || !id || !position) return;
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

  if (!id || !position) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide <code>?id=…&amp;position=…</code> in the URL.
          </Text>
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
