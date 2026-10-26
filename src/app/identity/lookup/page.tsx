'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useIdentityByPublicKeyHash, useIdentitiesByNonUniquePkh } from '@sdk/queries';
import { isPublicKeyHash, shortId } from '@util/identifier';
import { idToString } from '@util/sdk-shape';

function Content() {
  const params = useSearchParams();
  const raw = (params.get('pkh') ?? '').trim();
  const pkh = isPublicKeyHash(raw) ? raw.toLowerCase() : '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Identity' },
    { label: 'Reverse lookup' },
    { label: pkh ? shortId(pkh) : '—' },
  ]);
  usePageTitle(pkh ? `Public-key hash ${shortId(pkh)}` : 'Identity reverse lookup');

  const uniqueQ = useIdentityByPublicKeyHash(pkh || undefined);
  const [startAfter, setStartAfter] = useState<string | undefined>(undefined);
  const nonUniqueQ = useIdentitiesByNonUniquePkh(
    uniqueQ.isSuccess && !uniqueQ.data ? (pkh || undefined) : undefined,
    startAfter,
  );

  if (!pkh) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">Identity reverse lookup</Heading>
            <Text fontSize="sm" color="muted" maxW="70ch">
              Find the identity that owns a public key, from the key&apos;s 20-byte hash
              (HASH160). Unique keys resolve to one identity; otherwise every identity with a
              non-unique key of that hash is listed.
            </Text>
            {raw ? (
              <Text role="alert" fontSize="sm" color="failed">
                &ldquo;{shortId(raw, 12, 6)}&rdquo; is not a 40-character hex public-key hash.
              </Text>
            ) : null}
            <LookupInput
              label="Public-key hash"
              placeholder="40-char hex"
              description="identities.byPublicKeyHash, falling back to byNonUniquePublicKeyHash."
              validate={(v) => (isPublicKeyHash(v) ? null : 'Expected a 40-char hex string.')}
              buildHref={(v) => `/identity/lookup/?pkh=${encodeURIComponent(v.toLowerCase())}`}
            />
          </VStack>
        </InfoBlock>
      </Container>
    );
  }

  const uniqueId = idToString(uniqueQ.data);
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
                Unique match (via <code>identities.byPublicKeyHash</code>):
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
                Non-unique matches (via <code>identities.byNonUniquePublicKeyHash</code>):
              </Text>
              {nonUniqueList.map((item, idx) => {
                const iid = idToString(item);
                if (!iid) return null;
                return <IdentityLink key={`${iid}-${idx}`} id={iid} />;
              })}
              <HStack spacing={3} pt={2}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const last = nonUniqueList[nonUniqueList.length - 1];
                    const lastId = idToString(last);
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
