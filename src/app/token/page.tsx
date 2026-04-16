'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { TokenView } from '@components/token/TokenView';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  if (!id) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a token ID as <code>?id=…</code>.</Text>
        </InfoBlock>
      </Container>
    );
  }
  return <TokenView tokenId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
