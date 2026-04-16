'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { Identifier } from '@components/data/Identifier';
import { SeededHoldersForm } from '@components/token/SeededHoldersForm';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { shortId } from '@util/identifier';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Token' },
    { label: id ? shortId(id) : '—', href: id ? `/token/?id=${encodeURIComponent(id)}` : undefined },
    { label: 'holders' },
  ]);

  if (!id) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a token ID as <code>?id=…</code>.</Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Token holders (scoped)
            </Heading>
            <Identifier value={id} avatar copy />
          </VStack>
        </InfoBlock>
        <SeededHoldersForm tokenId={id} />
      </VStack>
    </Container>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
