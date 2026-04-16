'use client';

import { useParams } from 'next/navigation';
import { Button, Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { Identifier } from '@components/data/Identifier';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useStateTransitionResult } from '@sdk/queries';
import { shortId } from '@util/identifier';

export default function View({ hash: fromServer }: { hash: string }) {
  const p = useParams<{ hash: string }>();
  const hash = p?.hash ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'State transition' },
    { label: shortId(hash) },
  ]);

  const q = useStateTransitionResult(hash);

  if (hash === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Paste a 64-character state transition hash in the URL or navbar search.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading size="md" color="gray.100">
              State transition result
            </Heading>
            <Identifier value={hash} avatar={false} copy highlight="both" />
          </VStack>
        </InfoBlock>

        {q.isLoading ? (
          <LoadingCard lines={4} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <NotFoundCard
            title="No result"
            description="The SDK returned no result for this hash yet. Try again in a moment."
            actions={[]}
          />
        ) : (
          <InfoBlock>
            <VStack align="stretch" spacing={3}>
              <Heading size="sm" color="gray.100">
                Result
              </Heading>
              <CodeBlock value={q.data} />
              <Button size="sm" variant="outline" onClick={() => q.refetch()}>
                Retry
              </Button>
            </VStack>
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}
