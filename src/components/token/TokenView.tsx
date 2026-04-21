'use client';

import NextLink from 'next/link';
import {
  Heading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { TokenDigestCard } from './TokenDigestCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import type { TokenFlags } from './TokenFlagsPills';
import {
  useTokenDirectPurchasePrices,
  useTokenStatuses,
  useTokenTotalSupply,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { readProp } from '@util/sdk-shape';

function flagsFromStatus(status: unknown): TokenFlags {
  const s = status as Record<string, unknown> | undefined;
  return {
    mintable: Boolean(s?.mintable),
    burnable: Boolean(s?.burnable),
    freezable: Boolean(s?.freezable),
    unfreezable: Boolean(s?.unfreezable),
    destroyable: Boolean(s?.destroyable),
    emergencyAction: Boolean(s?.emergencyAction ?? s?.emergencyActionEnabled),
  };
}

export function TokenView({ tokenId }: { tokenId: string }) {
  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Token' },
    { label: shortId(tokenId) },
  ]);

  const supplyQ = useTokenTotalSupply(tokenId);
  const statusesQ = useTokenStatuses([tokenId]);
  const pricesQ = useTokenDirectPurchasePrices([tokenId]);

  const isLoading = supplyQ.isLoading;
  const supply = supplyQ.data as
    | { totalSupply?: bigint; baseSupply?: bigint; maxSupply?: bigint }
    | null
    | undefined;

  const statusMap = statusesQ.data as Map<string, unknown> | null | undefined;
  const statusForToken = statusMap?.get(tokenId);

  const pricesMap = pricesQ.data as Map<string, unknown> | null | undefined;
  const priceForToken = pricesMap?.get(tokenId) as
    | { price?: bigint | number; baseCurrencyPrice?: bigint | number }
    | null
    | undefined;

  const notFound = !isLoading && supplyQ.isSuccess && !supply;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {isLoading ? (
          <LoadingCard lines={5} />
        ) : supplyQ.isError ? (
          <ErrorCard error={supplyQ.error} onRetry={() => supplyQ.refetch()} />
        ) : notFound ? (
          <NotFoundCard
            title="Token not found"
            description={`No token with id ${shortId(tokenId)} on this network.`}
          />
        ) : (
          <>
            <TokenDigestCard
              id={tokenId}
              totalSupply={supply?.totalSupply ?? null}
              maxSupply={supply?.maxSupply ?? null}
              baseSupply={supply?.baseSupply ?? null}
              price={
                priceForToken
                  ? String(
                      readProp<bigint | number>(priceForToken, 'price') ??
                      readProp<bigint | number>(priceForToken, 'baseCurrencyPrice') ??
                      '—',
                    )
                  : null
              }
              flags={flagsFromStatus(statusForToken)}
            />

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Overview</Tab>
                <Tab fontSize="sm">Status</Tab>
                <Tab fontSize="sm">Holders</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Supply
                    </Heading>
                    <CodeBlock value={supply ?? 'No supply data.'} />
                  </InfoBlock>
                </TabPanel>
                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Status
                    </Heading>
                    {statusesQ.isLoading ? (
                      <LoadingCard lines={2} />
                    ) : (
                      <CodeBlock value={statusForToken ?? 'No status reported.'} />
                    )}
                  </InfoBlock>
                </TabPanel>
                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Holders (scoped)
                    </Heading>
                    <Text fontSize="sm" color="gray.400">
                      Dash Platform does not publish a global holders index. Use the{' '}
                      <NextLink
                        href={`/token/holders/?id=${encodeURIComponent(tokenId)}`}
                        style={{ color: 'var(--chakra-colors-brand-light)' }}
                      >
                        seeded holders
                      </NextLink>{' '}
                      form to look up balances for identities you supply.
                    </Text>
                  </InfoBlock>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </>
        )}
      </VStack>
    </Container>
  );
}
