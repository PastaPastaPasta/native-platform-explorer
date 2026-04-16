'use client';

import { useParams } from 'next/navigation';
import { Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { NotActive } from '@components/data/NotActive';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useAddressInfo } from '@sdk/queries';
import { shortId } from '@util/identifier';

export default function View({ addr: fromServer }: { addr: string }) {
  const p = useParams<{ addr: string }>();
  const addr = p?.addr ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Address' },
    { label: shortId(addr) },
  ]);

  const q = useAddressInfo(addr);

  if (addr === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a real Platform address in the URL.</Text>
        </InfoBlock>
      </Container>
    );
  }

  const info = q.data as { balance?: bigint; nonce?: bigint } | null | undefined;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {q.isLoading ? (
          <LoadingCard />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : !info ? (
          <NotFoundCard
            title="Address not found"
            description={`No Platform record for address ${shortId(addr)}.`}
          />
        ) : (
          <InfoBlock emphasised>
            <VStack align="stretch" spacing={4}>
              <Heading size="md" color="gray.100">
                Address
              </Heading>
              <Identifier value={addr} avatar={false} copy highlight="both" />
              <HStack spacing={10} flexWrap="wrap">
                <InfoLine
                  label="Balance"
                  value={<CreditsBlock credits={info.balance ?? null} />}
                />
                <InfoLine
                  label="Nonce"
                  value={
                    info.nonce !== undefined && info.nonce !== null ? (
                      <Identifier
                        value={String(info.nonce)}
                        avatar={false}
                        copy={false}
                        highlight="highlight"
                      />
                    ) : (
                      <NotActive />
                    )
                  }
                />
              </HStack>
            </VStack>
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}
