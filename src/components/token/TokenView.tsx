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
import { TokenOverview } from './TokenOverview';
import { TokenBalanceLookup } from './TokenBalanceLookup';
import { TokenWriteActions } from './TokenWriteActions';
import { TokenPausedBadge, TokenPrice, readTokenPrice } from './TokenPrice';
import { IdentityLink } from '@components/data/IdentityLink';
import { InfoLine } from '@components/data/InfoLine';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useTabParam } from '@hooks/useTabParam';
import {
  useContract,
  useTokenContractInfo,
  useTokenDirectPurchasePrices,
  useTokenStatuses,
  useTokenTotalSupply,
  type TokenContractInfoShape,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { idToString } from '@util/sdk-shape';
import { normaliseContract, toPlain, tokenConfigAt, type TokenConfigShape } from '@util/contract';
import { tokenFlagsFromConfig } from '@util/token-rules';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';

const TABS = ['overview', 'definition', 'status', 'holders', 'balance'] as const;

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
  const { network } = useSdk();
  const tabs = useTabParam(TABS);
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
  const priceForToken = pricesMap?.get(tokenId);
  const price = readTokenPrice(priceForToken);
  const configPlain = tokenConfig ? toPlain(tokenConfig.raw) : undefined;
  const perpetual = (configPlain as { distributionRules?: { perpetualDistribution?: unknown } } | undefined)
    ?.distributionRules?.perpetualDistribution;

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
              totalSupply={supply?.totalSupply ?? null}
              maxSupply={supply?.maxSupply ?? (tokenConfig?.maxSupply as bigint | number | string | null) ?? null}
              baseSupply={supply?.baseSupply ?? (tokenConfig?.baseSupply as bigint | number | string | null) ?? null}
              price={price ? <TokenPrice info={priceForToken} decimals={tokenConfig?.decimals} /> : null}
              flags={tokenFlagsFromConfig(configPlain)}
              ownerContractId={ownerContractId}
              tokenContractPosition={position}
            />

            {contractQ.data && ownerContractId && position !== null && tokenConfig ? (
              <TokenWriteActions
                tokenId={tokenId}
                contractId={ownerContractId}
                position={position}
                contract={contractQ.data}
                forSale={!!price}
              />
            ) : null}

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy index={tabs.index} onChange={tabs.onChange}>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Overview</Tab>
                <Tab fontSize="sm">Definition</Tab>
                <Tab fontSize="sm">Status</Tab>
                <Tab fontSize="sm">Holders</Tab>
                <Tab fontSize="sm">Balance lookup</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={0}>
                  {contractQ.isLoading || contractInfoQ.isLoading ? (
                    <LoadingCard lines={4} />
                  ) : contractInfoQ.isError ? (
                    <ErrorCard error={contractInfoQ.error} onRetry={() => contractInfoQ.refetch()} />
                  ) : contractQ.isError ? (
                    <ErrorCard error={contractQ.error} onRetry={() => contractQ.refetch()} />
                  ) : tokenConfig ? (
                    <TokenOverview config={tokenConfig.raw} decimals={tokenConfig.decimals} totalSupply={supply?.totalSupply ?? null} />
                  ) : (
                    <InfoBlock>
                      <Text fontSize="sm" color="gray.400">
                        {ownerContractId
                          ? 'Contract loaded but no token configuration at this position.'
                          : 'No owning contract recorded for this token ID, so its rules cannot be shown.'}
                      </Text>
                    </InfoBlock>
                  )}
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
                                href={withNetwork(`/contract/?id=${encodeURIComponent(ownerContractId)}`, network)}
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
                      {contractQ.isLoading ? (
                        <LoadingCard lines={2} />
                      ) : contractQ.isError ? (
                        <ErrorCard error={contractQ.error} onRetry={() => contractQ.refetch()} />
                      ) : contractQ.isSuccess && tokenConfig ? (
                        localizationsBlock(tokenConfig)
                      ) : (
                        <Text fontSize="sm" color="gray.400">
                          {ownerContractId
                            ? 'Contract loaded but no token configuration at this position.'
                            : 'Awaiting owning-contract resolution.'}
                        </Text>
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

                  </VStack>
                </TabPanel>
                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Status
                    </Heading>
                    {statusesQ.isError ? (
                      <ErrorCard error={statusesQ.error} onRetry={() => statusesQ.refetch()} />
                    ) : (
                      <HStack spacing={8} flexWrap="wrap" align="flex-start">
                        <InfoLine label="Trading status" value={<TokenPausedBadge status={statusForToken} loading={statusesQ.isLoading} />} />
                        <InfoLine
                          label="Direct-purchase price"
                          value={pricesQ.isError
                            ? <ErrorCard error={pricesQ.error} onRetry={() => pricesQ.refetch()} />
                            : pricesQ.isLoading ? <Text color="gray.400">…</Text> : <TokenPrice info={priceForToken} decimals={tokenConfig?.decimals} />}
                        />
                      </HStack>
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
                        href={withNetwork(`/token/holders/?id=${encodeURIComponent(tokenId)}`, network)}
                        style={{ color: 'var(--chakra-colors-brand-light)' }}
                      >
                        seeded holders
                      </NextLink>{' '}
                      form to look up balances for identities you supply.
                    </Text>
                  </InfoBlock>
                </TabPanel>
                <TabPanel px={0}>
                  <TokenBalanceLookup
                    tokenId={tokenId}
                    decimals={tokenConfig?.decimals}
                    hasPerpetualDistribution={perpetual !== null && perpetual !== undefined}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </>
        )}
      </VStack>
    </Container>
  );
}
