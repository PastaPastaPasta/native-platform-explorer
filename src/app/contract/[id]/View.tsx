'use client';

import { useParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Button,
  HStack,
  Heading,
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
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useContract,
  useContractHistory,
  useGroupsDataContracts,
  useTokenContractInfo,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import {
  documentTypeNames,
  groupPositions,
  normaliseContract,
  tokenPositions,
} from '@util/contract';

export default function View({ id: fromServer }: { id: string }) {
  const p = useParams<{ id: string }>();
  const id = p?.id ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Contract' },
    { label: shortId(id) },
  ]);

  const contractQ = useContract(id);
  const tokenInfoQ = useTokenContractInfo(id);
  const groupsQ = useGroupsDataContracts([id]);
  const historyQ = useContractHistory(id);

  if (id === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a contract ID in the URL or search.</Text>
        </InfoBlock>
      </Container>
    );
  }

  const contract = contractQ.data ? normaliseContract(contractQ.data) : null;
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

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
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
                    <CodeBlock value={contract.documentSchemas ?? contract.raw} />
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
                            <Button
                              as={NextLink}
                              href={`/contract/${id}/documents/${encodeURIComponent(t)}/`}
                              size="sm"
                              variant="outline"
                              colorScheme="blue"
                            >
                              {t}
                            </Button>
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
                    <HStack spacing={3} flexWrap="wrap">
                      {tokens.length === 0 ? (
                        <Text color="gray.400" fontSize="sm">
                          This contract does not define any tokens.
                        </Text>
                      ) : (
                        tokens.map((pos) => (
                          <Button
                            key={pos}
                            as={NextLink}
                            href={`/contract/${id}/tokens/${pos}/`}
                            size="sm"
                            variant="outline"
                            colorScheme="orange"
                          >
                            #{pos}
                          </Button>
                        ))
                      )}
                    </HStack>
                    {tokenInfoQ.data ? (
                      <CodeBlock value={tokenInfoQ.data} />
                    ) : null}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Groups
                    </Heading>
                    <HStack spacing={3} flexWrap="wrap">
                      {groups.length === 0 ? (
                        <Text color="gray.400" fontSize="sm">
                          This contract does not define any groups.
                        </Text>
                      ) : (
                        groups.map((pos) => (
                          <Button
                            key={pos}
                            as={NextLink}
                            href={`/groups/${id}/${pos}/`}
                            size="sm"
                            variant="outline"
                            colorScheme="blue"
                          >
                            Group #{pos}
                          </Button>
                        ))
                      )}
                    </HStack>
                    {groupsQ.data ? <CodeBlock value={groupsQ.data} /> : null}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Version history
                    </Heading>
                    {historyQ.isLoading ? (
                      <LoadingCard lines={3} />
                    ) : historyQ.isError ? (
                      <ErrorCard error={historyQ.error} onRetry={() => historyQ.refetch()} />
                    ) : (
                      <CodeBlock value={historyQ.data ?? 'No history recorded.'} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <Heading size="sm" mb={3} color="gray.100">
                      Internal config
                    </Heading>
                    <CodeBlock value={contract.raw} />
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
