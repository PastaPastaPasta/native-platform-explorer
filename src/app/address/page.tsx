'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { NotActive } from '@components/data/NotActive';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useSdk } from '@sdk/hooks';
import { useAddressInfo } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { platformAddressError, platformAddressHrp } from '@util/platform-address';

function Content() {
  const params = useSearchParams();
  const addr = (params.get('addr') ?? '').trim();
  const { network } = useSdk();

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Address' },
    { label: addr ? shortId(addr) : '—' },
  ]);
  usePageTitle(addr ? `Address ${shortId(addr, 10, 6)}` : 'Platform address');

  const q = useAddressInfo(addr || undefined);

  const lookup = (
    <LookupInput
      label="Platform address"
      placeholder={`${platformAddressHrp(network)}1…`}
      description={`A bech32m address for ${network}. Shows its credit balance and nonce (addresses.get).`}
      validate={(v) => platformAddressError(v, network)}
      buildHref={(v) => `/address/?addr=${encodeURIComponent(v.toLowerCase())}`}
      buttonLabel="Look up"
    />
  );

  if (!addr) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">Platform address lookup</Heading>
            {lookup}
          </VStack>
        </InfoBlock>
      </Container>
    );
  }

  const addrError = platformAddressError(addr, network);

  const info = q.data as { balance?: bigint; nonce?: bigint } | null | undefined;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {addrError ? (
          <Text role="alert" fontSize="sm" color="warning">
            {addrError}
          </Text>
        ) : null}
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
              <Identifier value={addr} avatar={false} copy highlight="both" copyLabel="Copy address" />
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
        <InfoBlock>{lookup}</InfoBlock>
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
