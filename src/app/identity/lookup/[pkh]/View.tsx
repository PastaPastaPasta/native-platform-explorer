'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useIdentityByPublicKeyHash,
  useIdentitiesByNonUniquePkh,
} from '@sdk/queries';
import { shortId } from '@util/identifier';

function extractId(identity: unknown): string | null {
  if (!identity || typeof identity !== 'object') return null;
  const obj = identity as Record<string, unknown>;
  const id = obj.id ?? (typeof obj.getId === 'function' ? (obj.getId as () => unknown)() : null);
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object' && 'toString' in id) {
    try {
      return String(id);
    } catch {
      return null;
    }
  }
  return null;
}

export default function View({ pkh: fromServer }: { pkh: string }) {
  const p = useParams<{ pkh: string }>();
  const pkh = p?.pkh ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Identity' },
    { label: 'Reverse lookup' },
    { label: shortId(pkh) },
  ]);

  const uniqueQ = useIdentityByPublicKeyHash(pkh);
  const [startAfter, setStartAfter] = useState<string | undefined>(undefined);
  const nonUniqueQ = useIdentitiesByNonUniquePkh(
    uniqueQ.isSuccess && !uniqueQ.data ? pkh : undefined,
    startAfter,
  );

  if (pkh === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Pass a 40-character hex public-key hash in the URL or paste it into the navbar search.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const uniqueId = extractId(uniqueQ.data);
  const nonUniqueList = (nonUniqueQ.data as unknown[] | undefined) ?? [];

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {uniqueQ.isLoading ? (
          <LoadingCard />
        ) : uniqueQ.isError ? (
          <ErrorCard error={uniqueQ.error} onRetry={() => uniqueQ.refetch()} />
        ) : uniqueId ? (
          <InfoBlock emphasised>
            <VStack align="flex-start" spacing={2}>
              <Text fontSize="sm" color="gray.250">
                Unique match (lookup via <code>identities.byPublicKeyHash</code>):
              </Text>
              <IdentityLink id={uniqueId} />
            </VStack>
          </InfoBlock>
        ) : nonUniqueQ.isLoading ? (
          <LoadingCard />
        ) : nonUniqueQ.isError ? (
          <ErrorCard error={nonUniqueQ.error} onRetry={() => nonUniqueQ.refetch()} />
        ) : nonUniqueList.length === 0 ? (
          <NotFoundCard
            title="No identities found"
            description={`No identity is bound to public-key hash ${shortId(pkh)}.`}
            actions={[{ label: 'Return home', href: '/' }]}
          />
        ) : (
          <InfoBlock>
            <VStack align="flex-start" spacing={3}>
              <Text fontSize="sm" color="gray.250">
                Non-unique matches (lookup via <code>identities.byNonUniquePublicKeyHash</code>):
              </Text>
              {nonUniqueList.map((item, idx) => {
                const iid = extractId(item);
                if (!iid) return null;
                return <IdentityLink key={`${iid}-${idx}`} id={iid} />;
              })}
              <HStack spacing={3} pt={2}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const last = nonUniqueList[nonUniqueList.length - 1];
                    const lastId = extractId(last);
                    if (lastId) setStartAfter(lastId);
                  }}
                  isDisabled={nonUniqueList.length < 20}
                >
                  Load more
                </Button>
              </HStack>
            </VStack>
          </InfoBlock>
        )}
      </VStack>
    </Container>
  );
}
