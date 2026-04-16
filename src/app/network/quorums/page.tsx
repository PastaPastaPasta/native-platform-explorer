'use client';

import { Heading, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentQuorumsInfo } from '@sdk/queries';

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Quorums' }]);
  const q = useCurrentQuorumsInfo();
  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Active quorums
          </Heading>
        </InfoBlock>
        {q.isLoading ? (
          <LoadingCard lines={4} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <InfoBlock>
            <CodeBlock value={q.data ?? 'No quorums reported.'} />
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}
