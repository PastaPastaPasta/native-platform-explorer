'use client';

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
import { TokenDigestCard } from '@components/token/TokenDigestCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import type { TokenFlags } from '@components/token/TokenFlagsPills';
import {
  useTokenDirectPurchasePrices,
  useTokenStatuses,
  useTokenTotalSupply,
} from '@sdk/queries';
import { shortId } from '@util/identifier';

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

export default function TokenView({ tokenId }: { tokenId: string }) {
  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Token' },
    { label: shortId(tokenId) },
  ]);

  const supplyQ = useTokenTotalSupply(tokenId);
  const statusesQ = useTokenStatuses([tokenId]);
  const pricesQ = useTokenDirectPurchasePrices([tokenId]);

  if (tokenId === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide a real token ID in the URL, or arrive via a contract&apos;s Tokens tab.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const isLoading = supplyQ.isLoading;
  const supply = supplyQ.data as
    | { totalSystemAmount?: bigint; baseAmount?: bigint; maxAmount?: bigint }
    | null
    | undefined;

  const statusMap = statusesQ.data as Map<string, unknown> | null | undefined;
  const statusForToken = statusMap?.get(tokenId);

  const pricesMap = pricesQ.data as Map<string, unknown> | null | undefined;
  const priceForToken = pricesMap?.get(tokenId);

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
              totalSupply={supply?.totalSystemAmount ?? null}
              maxSupply={supply?.maxAmount ?? null}
              baseSupply={supply?.baseAmount ?? null}
              price={
                priceForToken
                  ? typeof priceForToken === 'object'
                    ? JSON.stringify(priceForToken)
                    : String(priceForToken)
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
                      Dash Platform does not publish a global holders index. The seeded
                      holders UI arrives in Stage 4 and will query{' '}
                      <code>tokens.balances(ids, tokenId)</code> for identities you supply or
                      have recently viewed.
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
