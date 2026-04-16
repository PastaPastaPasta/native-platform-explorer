'use client';

import { useParams } from 'next/navigation';
import {
  Box,
  Heading,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useGroupActions,
  useGroupInfo,
  useGroupMembers,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { readProp } from '@util/sdk-shape';

export default function View({
  contractId: fromServerContract,
  position: fromServerPos,
}: {
  contractId: string;
  position: string;
}) {
  const p = useParams<{ contractId: string; position: string }>();
  const contractId = p?.contractId ?? fromServerContract;
  const positionStr = p?.position ?? fromServerPos;
  const position = Number(positionStr);
  const valid = Number.isFinite(position);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Groups' },
    { label: shortId(contractId), href: `/groups/${contractId}/` },
    { label: `#${positionStr}` },
  ]);

  const infoQ = useGroupInfo(contractId, valid ? position : undefined);
  const membersQ = useGroupMembers(contractId, valid ? position : undefined);
  const actionsQ = useGroupActions(contractId, valid ? position : undefined);

  if (!valid || contractId === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Invalid group URL.</Text>
        </InfoBlock>
      </Container>
    );
  }

  const memberEntries =
    membersQ.data instanceof Map
      ? [...membersQ.data.entries()].map(([id, power]) => ({
          id: String(id),
          power: typeof power === 'bigint' ? Number(power) : Number(power),
        }))
      : [];
  memberEntries.sort((a, b) => b.power - a.power);

  const actionsEntries =
    actionsQ.data instanceof Map
      ? [...actionsQ.data.entries()].map(([id, action]) => ({
          id: String(id),
          action,
        }))
      : [];

  const threshold = readProp<number | bigint>(infoQ.data, 'requiredPower');

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {infoQ.isLoading ? (
          <LoadingCard lines={4} />
        ) : infoQ.isError ? (
          <ErrorCard error={infoQ.error} onRetry={() => infoQ.refetch()} />
        ) : !infoQ.data ? (
          <NotFoundCard
            title="Group not found"
            description={`No group at position #${position} in contract ${shortId(contractId)}.`}
            actions={[{ label: 'Back to groups', href: `/groups/${contractId}/` }]}
          />
        ) : (
          <>
            <InfoBlock emphasised>
              <VStack align="stretch" spacing={3}>
                <Heading size="md" color="gray.100">
                  Group #{position}
                </Heading>
                <HStack spacing={6} flexWrap="wrap">
                  <InfoLine
                    label="Contract"
                    value={<Identifier value={contractId} href={`/contract/${contractId}/`} dense />}
                  />
                  <InfoLine
                    label="Required power"
                    value={
                      <Text fontFamily="mono" fontSize="md" color="gray.100">
                        {threshold !== undefined ? String(threshold) : '—'}
                      </Text>
                    }
                  />
                </HStack>
              </VStack>
            </InfoBlock>

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Members ({memberEntries.length})</Tab>
                <Tab fontSize="sm">Actions</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={0}>
                  <InfoBlock>
                    {membersQ.isLoading ? (
                      <LoadingCard lines={3} />
                    ) : memberEntries.length === 0 ? (
                      <Text color="gray.400" fontSize="sm">
                        No members listed.
                      </Text>
                    ) : (
                      <Box overflowX="auto">
                        <Table size="sm">
                          <Thead>
                            <Tr>
                              <Th color="gray.400" borderColor="gray.750">
                                Identity
                              </Th>
                              <Th color="gray.400" borderColor="gray.750" isNumeric>
                                Power
                              </Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {memberEntries.map((m) => (
                              <Tr key={m.id} _hover={{ bg: 'gray.800' }}>
                                <Td borderColor="gray.750">
                                  <IdentityLink id={m.id} dense />
                                </Td>
                                <Td borderColor="gray.750" isNumeric fontFamily="mono">
                                  {m.power}
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    {actionsQ.isLoading ? (
                      <LoadingCard lines={3} />
                    ) : actionsQ.isError ? (
                      <ErrorCard error={actionsQ.error} onRetry={() => actionsQ.refetch()} />
                    ) : actionsEntries.length === 0 ? (
                      <Text color="gray.400" fontSize="sm">
                        No actions recorded for this group.
                      </Text>
                    ) : (
                      <VStack align="stretch" spacing={2}>
                        {actionsEntries.map((a) => (
                          <InfoBlock key={a.id}>
                            <VStack align="stretch" spacing={2}>
                              <Identifier value={a.id} avatar copy dense />
                              <CodeBlock value={a.action ?? {}} />
                            </VStack>
                          </InfoBlock>
                        ))}
                      </VStack>
                    )}
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
