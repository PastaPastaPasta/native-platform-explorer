'use client';

import { useParams } from 'next/navigation';
import { Heading, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { Identifier } from '@components/data/Identifier';
import { SeededHoldersForm } from '@components/token/SeededHoldersForm';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { shortId } from '@util/identifier';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Token' },
    { label: shortId(id), href: `/token/${id}/` },
    { label: 'holders' },
  ]);

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
