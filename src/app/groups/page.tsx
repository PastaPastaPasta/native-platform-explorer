'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Button,
  Heading,
  HStack,
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
import { LookupInput } from '@ui/LookupInput';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useGroupInfos } from '@sdk/queries';
import { isBase58Identifier, shortId } from '@util/identifier';
import { useWellKnownName } from '@hooks/useWellKnownName';
import { useWellKnownEntries } from '@hooks/useWellKnownRegistry';
import { readProp } from '@util/sdk-shape';

function Content() {
  const params = useSearchParams();
  const contractId = (params.get('contractId') ?? '').trim();

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Groups' },
    { label: contractId ? shortId(contractId) : '—' },
  ]);

  const wellKnown = useWellKnownName(contractId);
  usePageTitle(contractId ? `Groups · ${wellKnown?.name ?? shortId(contractId)}` : 'Groups');
  // Registry entries tagged "groups" are contracts known to define groups.
  const groupContracts = useWellKnownEntries('contract').filter((entry) => entry.tags?.includes('groups'));
  const q = useGroupInfos(contractId || undefined);

  const groups = (() => {
    const raw = q.data;
    if (!raw) return [];
    if (raw instanceof Map) {
      return [...raw.entries()].map(([pos, info]) => ({ position: Number(pos), info }));
    }
    return [];
  })();

  if (!contractId) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <VStack align="stretch" spacing={4}>
          <InfoBlock emphasised>
            <VStack align="stretch" spacing={3}>
              <Heading as="h1" size="md">Groups</Heading>
              <Text fontSize="sm" color="muted" maxW="70ch">
                Groups are multi-party signers defined inside a data contract, typically to
                control token actions. Platform has no global list of groups, so open them by
                the contract that defines them.
              </Text>
              <LookupInput
                label="Contract ID"
                placeholder="43–44 char base58 Identifier"
                description="Lists the contract's groups by position (group.infos)."
                validate={(v) => (isBase58Identifier(v) ? null : 'Expected a 43–44 char base58 string.')}
                buildHref={(v) => `/groups/?contractId=${encodeURIComponent(v)}`}
              />
            </VStack>
          </InfoBlock>
          <InfoBlock>
            <VStack align="stretch" spacing={2}>
              <Heading size="sm">Well-known contracts with groups</Heading>
              {groupContracts.length === 0 ? (
                <Text fontSize="sm" color="muted">
                  None of the well-known contracts on this network define groups. Tag a local
                  registry entry with <code>groups</code> in Settings to list it here.
                </Text>
              ) : (
                <HStack spacing={2} flexWrap="wrap">
                  {groupContracts.map((entry) => (
                    <Button
                      key={entry.id}
                      as={NextLink}
                      href={`/groups/?contractId=${encodeURIComponent(entry.id)}`}
                      size="sm"
                      variant="outline"
                    >
                      {entry.name}
                    </Button>
                  ))}
                </HStack>
              )}
            </VStack>
          </InfoBlock>
        </VStack>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Groups · {wellKnown?.name ?? 'contract'}
            </Heading>
            <Identifier
              value={contractId}
              href={`/contract/?id=${encodeURIComponent(contractId)}`}
              dense
            />
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {q.isLoading ? (
            <LoadingCard lines={4} />
          ) : q.isError ? (
            <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          ) : groups.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              This contract does not define any groups.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">
                      Position
                    </Th>
                    <Th color="gray.400" borderColor="gray.750">
                      Threshold
                    </Th>
                    <Th borderColor="gray.750" />
                  </Tr>
                </Thead>
                <Tbody>
                  {groups.map((g) => {
                    const threshold = readProp<number | bigint>(g.info, 'requiredPower');
                    return (
                      <Tr key={g.position} _hover={{ bg: 'gray.800' }}>
                        <Td borderColor="gray.750" fontFamily="mono">
                          #{g.position}
                        </Td>
                        <Td borderColor="gray.750" fontFamily="mono">
                          {threshold !== undefined ? String(threshold) : '—'}
                        </Td>
                        <Td borderColor="gray.750" textAlign="right">
                          <Button
                            as={NextLink}
                            href={`/groups/detail/?contractId=${encodeURIComponent(contractId)}&position=${g.position}`}
                            size="xs"
                            variant="outline"
                            colorScheme="blue"
                          >
                            Open
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
          {q.data ? (
            <HStack mt={3}>
              <CodeBlock value={q.data} collapsedHeight={100} />
            </HStack>
          ) : null}
        </InfoBlock>
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
