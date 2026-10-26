'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { Identifier } from '@components/data/Identifier';
import { SeededHoldersForm } from '@components/token/SeededHoldersForm';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useWellKnownName } from '@hooks/useWellKnownName';
import { isBase58Identifier, shortId } from '@util/identifier';

function Content() {
  const params = useSearchParams();
  const id = (params.get('id') ?? '').trim();
  const wellKnown = useWellKnownName(id || undefined);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Token' },
    { label: id ? shortId(id) : '—', href: id ? `/token/?id=${encodeURIComponent(id)}` : undefined },
    { label: 'holders' },
  ]);
  usePageTitle(id ? `${wellKnown?.name ?? `Token ${shortId(id)}`} holders` : 'Token holders');

  if (!id) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">Token holders</Heading>
            <Text fontSize="sm" color="muted" maxW="70ch">
              Platform has no holder index, so balances are looked up for identities you
              list. Start with the token.
            </Text>
            <LookupInput
              label="Token ID"
              placeholder="43–44 char base58 Identifier"
              validate={(v) => (isBase58Identifier(v) ? null : 'Expected a 43–44 char base58 string.')}
              buildHref={(v) => `/token/holders/?id=${encodeURIComponent(v)}`}
            />
          </VStack>
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
            <Identifier value={id} avatar copy copyLabel="Copy token ID" />
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
