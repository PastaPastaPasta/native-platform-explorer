'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import dynamic from 'next/dynamic';
import {
  Button,
  Heading,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { DataContractDigestCard } from '@components/contract/DataContractDigestCard';
import { ContractLanding } from '@components/contract/ContractLanding';
import { ContractTokensTab } from '@components/contract/ContractTokensTab';
import { ContractGroupsTab } from '@components/contract/ContractGroupsTab';
import { ContractInternalTab } from '@components/contract/ContractInternalTab';
import { SchemaNavigator } from '@components/contract/SchemaNavigator';
import { WriteActions } from '@components/broadcast/WriteActions';
import { writeModeEnabled } from '@/config';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useTabParam } from '@hooks/useTabParam';
import { useContract, useContractHistory } from '@sdk/queries';
import { shortId } from '@util/identifier';
import {
  contractKeepsHistory,
  documentTypeNames,
  groupPositions,
  normaliseContract,
  tokenPositions,
} from '@util/contract';
import { useContractTitle } from '@hooks/useEntityTitle';

// The diff view only matters for the few contracts that keep history.
const ContractHistoryTimeline = dynamic(
  () => import('@components/contract/ContractHistoryTimeline').then((m) => m.ContractHistoryTimeline),
  { loading: () => <LoadingCard lines={3} /> },
);

const TABS = ['schema', 'documents', 'tokens', 'groups', 'history', 'internal'] as const;

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  useContractTitle(id);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Contract' },
    { label: id ? shortId(id) : '—' },
  ]);

  const contractQ = useContract(id || undefined);
  const tabs = useTabParam(TABS);

  const contract = contractQ.data ? normaliseContract(contractQ.data) : null;
  // Platform keeps old versions only when `config.keepsHistory` is set; for
  // any other contract `getHistory` fails its proof, so it is not asked.
  const keepsHistory = contract ? contractKeepsHistory(contract) : false;
  const historyQ = useContractHistory(keepsHistory && tabs.tab === 'history' ? id : undefined);

  if (!id) {
    return <ContractLanding />;
  }

  const docTypes = contract ? documentTypeNames(contract) : [];
  const tokens = contract ? tokenPositions(contract) : [];
  const groups = contract ? groupPositions(contract) : [];

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {contractQ.isLoading ? (
          <LoadingCard lines={5} />
        ) : contractQ.isError ? (
          <ErrorCard error={contractQ.error} onRetry={() => contractQ.refetch()} />
        ) : !contract?.raw ? (
          <NotFoundCard
            title="Contract not found"
            description={`No contract with id ${shortId(id)} on this network.`}
          />
        ) : (
          <>
            <DataContractDigestCard
              id={id}
              ownerId={contract.ownerId}
              version={contract.version}
              documentTypeCount={docTypes.length}
              tokenCount={tokens.length}
              groupCount={groups.length}
            />

            <WriteActions
              title="Actions"
              links={[
                {
                  op: 'document.create',
                  label: 'Create a document',
                  params: { contract: id },
                },
                {
                  op: 'contract.update',
                  label: 'Update contract',
                  params: { contract: id },
                  ownsTo: contract.ownerId ?? undefined,
                },
              ]}
            />

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy index={tabs.index} onChange={tabs.onChange}>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Schema</Tab>
                <Tab fontSize="sm">Document types ({docTypes.length})</Tab>
                <Tab fontSize="sm">Tokens ({tokens.length})</Tab>
                <Tab fontSize="sm">Groups ({groups.length})</Tab>
                <Tab fontSize="sm">History</Tab>
                <Tab fontSize="sm">Internal</Tab>
              </TabList>

              <TabPanels>
                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      JSON Schema
                    </Heading>
                    <SchemaNavigator key={id} schemas={contract.documentSchemas} />
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Document types
                    </Heading>
                    <Wrap spacing={2}>
                      {docTypes.length === 0 ? (
                        <Text color="gray.400" fontSize="sm">
                          This contract defines no document types.
                        </Text>
                      ) : (
                        docTypes.map((t) => (
                          <WrapItem key={t}>
                            <HStack spacing={1}>
                              <Button
                                as={NextLink}
                                href={`/contract/documents/?id=${encodeURIComponent(id)}&type=${encodeURIComponent(t)}`}
                                size="sm"
                                variant="outline"
                                colorScheme="blue"
                              >
                                {t}
                              </Button>
                              {writeModeEnabled() ? (
                                <Button
                                  as={NextLink}
                                  href={`/broadcast/?op=document.create&contract=${encodeURIComponent(id)}&type=${encodeURIComponent(t)}`}
                                  size="sm"
                                  variant="ghost"
                                  colorScheme="blue"
                                  title={`Create a ${t} document`}
                                >
                                  + new
                                </Button>
                              ) : null}
                            </HStack>
                          </WrapItem>
                        ))
                      )}
                    </Wrap>
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Tokens
                    </Heading>
                    <ContractTokensTab contractId={id} contract={contract} />
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Groups
                    </Heading>
                    <ContractGroupsTab contractId={id} declared={contract.groups} />
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Version history
                    </Heading>
                    {!keepsHistory ? (
                      <Text color="gray.400" fontSize="sm">
                        This contract does not keep history (<code>config.keepsHistory</code> is
                        off), so Platform stores only its current version
                        {contract.version !== undefined ? ` (version ${String(contract.version)})` : ''}.
                      </Text>
                    ) : historyQ.isLoading ? (
                      <LoadingCard lines={3} />
                    ) : historyQ.isError ? (
                      <ErrorCard error={historyQ.error} onRetry={() => historyQ.refetch()} />
                    ) : (
                      <ContractHistoryTimeline history={historyQ.data} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Internal config
                    </Heading>
                    <ContractInternalTab contract={contract} />
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
