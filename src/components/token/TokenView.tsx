'use client';

import NextLink from 'next/link';
import {
  Badge,
  HStack,
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
import { IdentityLink } from '@components/data/IdentityLink';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import type { TokenFlags } from './TokenFlagsPills';
import {
  useContract,
  useTokenContractInfo,
  useTokenDirectPurchasePrices,
  useTokenStatuses,
  useTokenTotalSupply,
  type TokenContractInfoShape,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { idToString, readProp } from '@util/sdk-shape';
import { normaliseContract, tokenConfigAt, type TokenConfigShape } from '@util/contract';

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

function localizationsBlock(config: TokenConfigShape | null): React.ReactNode {
  if (!config?.localizations || Object.keys(config.localizations).length === 0) {
    return <Text fontSize="sm" color="gray.400">No localizations declared.</Text>;
  }
  return (
    <VStack align="stretch" spacing={2}>
      {Object.entries(config.localizations).map(([lang, loc]) => (
        <HStack key={lang} spacing={3} fontSize="sm">
          <Badge colorScheme="blue" variant="subtle">{lang}</Badge>
          <Text color="gray.100">{loc.singularForm ?? '—'}</Text>
          {loc.pluralForm && loc.pluralForm !== loc.singularForm ? (
            <Text color="gray.400">(plural: {loc.pluralForm})</Text>
          ) : null}
        </HStack>
      ))}
    </VStack>
  );
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
  const contractInfoQ = useTokenContractInfo(tokenId);

  const contractInfo = contractInfoQ.data as TokenContractInfoShape | null | undefined;
  const ownerContractId = contractInfo ? idToString(contractInfo.contractId) ?? null : null;
  const position =
    contractInfo && typeof contractInfo.tokenContractPosition === 'number'
      ? contractInfo.tokenContractPosition
      : null;

  // Chain: once we know the owning contract, fetch it to get the token
  // configuration at `position` — name, decimals, description, rules, etc.
  const contractQ = useContract(ownerContractId ?? undefined);
  const contract = contractQ.data ? normaliseContract(contractQ.data) : null;
  const tokenConfig =
    contract && position !== null ? tokenConfigAt(contract, position) : null;

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
              name={tokenConfig?.primaryName ?? null}
              decimals={tokenConfig?.decimals ?? null}
              totalSupply={
                supply?.totalSupply ?? (tokenConfig?.baseSupply as bigint | number | string | null) ?? null
              }
              maxSupply={supply?.maxSupply ?? (tokenConfig?.maxSupply as bigint | number | string | null) ?? null}
              baseSupply={supply?.baseSupply ?? (tokenConfig?.baseSupply as bigint | number | string | null) ?? null}
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
              ownerContractId={ownerContractId}
              tokenContractPosition={position}
            />

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Overview</Tab>
                <Tab fontSize="sm">Definition</Tab>
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
                  <VStack align="stretch" spacing={3}>
                    <InfoBlock>
                      <Heading size="sm" mb={3} color="gray.100">
                        Owning contract
                      </Heading>
                      {contractInfoQ.isLoading ? (
                        <LoadingCard lines={1} />
                      ) : contractInfoQ.isError ? (
                        <ErrorCard error={contractInfoQ.error} onRetry={() => contractInfoQ.refetch()} />
                      ) : ownerContractId ? (
                        <VStack align="stretch" spacing={2}>
                          <HStack spacing={3} fontSize="sm" color="gray.250" flexWrap="wrap">
                            <Text>
                              Contract{' '}
                              <NextLink
                                href={`/contract/?id=${encodeURIComponent(ownerContractId)}`}
                                style={{ color: 'var(--chakra-colors-brand-light)' }}
                              >
                                {shortId(ownerContractId)}
                              </NextLink>{' '}
                              · position #{position ?? '?'}
                            </Text>
                            {contract?.ownerId ? (
                              <Text>
                                owner <IdentityLink id={contract.ownerId} dense />
                              </Text>
                            ) : null}
                          </HStack>
                          <Text fontSize="xs" color="gray.500">
                            Resolved via the token-contract-info reverse index:
                            <code> path=[16, 160], keys=[tokenId] </code>
                            (GroveDB). The token ID alone is enough.
                          </Text>
                        </VStack>
                      ) : (
                        <Text fontSize="sm" color="gray.400">
                          No owning contract recorded for this token ID.
                        </Text>
                      )}
                    </InfoBlock>

                    <InfoBlock>
                      <Heading size="sm" mb={3} color="gray.100">
                        Localizations
                      </Heading>
                      {contractQ.isLoading && !tokenConfig ? (
                        <LoadingCard lines={2} />
                      ) : (
                        localizationsBlock(tokenConfig)
                      )}
                    </InfoBlock>

                    {tokenConfig?.description ? (
                      <InfoBlock>
                        <Heading size="sm" mb={3} color="gray.100">
                          Description
                        </Heading>
                        <Text fontSize="sm" color="gray.250">
                          {tokenConfig.description}
                        </Text>
                      </InfoBlock>
                    ) : null}

                    <InfoBlock>
                      <Heading size="sm" mb={3} color="gray.100">
                        Full configuration
                      </Heading>
                      {contractQ.isLoading && !tokenConfig ? (
                        <LoadingCard lines={3} />
                      ) : contractQ.isError ? (
                        <ErrorCard error={contractQ.error} onRetry={() => contractQ.refetch()} />
                      ) : tokenConfig ? (
                        <CodeBlock value={tokenConfig.raw ?? tokenConfig} />
                      ) : (
                        <Text fontSize="sm" color="gray.400">
                          {ownerContractId
                            ? 'Contract loaded but no token configuration at this position.'
                            : 'Awaiting owning-contract resolution.'}
                        </Text>
                      )}
                    </InfoBlock>
                  </VStack>
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
