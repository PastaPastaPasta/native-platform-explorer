'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  Button,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
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
import { IdentityDigestCard } from '@components/identity/IdentityDigestCard';
import { PublicKeysTable } from '@components/identity/PublicKeysTable';
import { AliasesList } from '@components/data/AliasesList';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useIdentity,
  useIdentityBalanceAndRevision,
  useIdentityContractNonce,
  useIdentityGroups,
  useIdentityKeys,
  useIdentityNonce,
  useIdentityVotes,
} from '@sdk/queries';
import { useDpnsUsernames } from '@sdk/queries';
import { shortId } from '@util/identifier';

function TabHeading({ label }: { label: string }) {
  return (
    <Text fontSize="sm" color="gray.100" fontWeight={600} mb={3}>
      {label}
    </Text>
  );
}

function AdvancedNonceLookup({ identityId }: { identityId: string }) {
  const [contractId, setContractId] = useState('');
  const [target, setTarget] = useState<string | undefined>(undefined);
  const q = useIdentityContractNonce(identityId, target);
  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Look up this identity&apos;s nonce for a specific contract.
      </Text>
      <InputGroup size="sm">
        <Input
          placeholder="Contract ID"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
        <InputRightElement width="5rem">
          <Button
            size="xs"
            colorScheme="blue"
            onClick={() => setTarget(contractId.trim() || undefined)}
            isDisabled={contractId.trim().length === 0}
          >
            Look up
          </Button>
        </InputRightElement>
      </InputGroup>
      {q.isLoading ? (
        <Text fontSize="xs" color="gray.400">
          Resolving…
        </Text>
      ) : q.isError ? (
        <ErrorCard error={q.error} onRetry={() => q.refetch()} />
      ) : target && q.data !== undefined ? (
        <CodeBlock value={{ identityId, contractId: target, nonce: String(q.data ?? null) }} />
      ) : null}
    </VStack>
  );
}

export default function IdentityView({ id: fromServer }: { id: string }) {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id ?? fromServer;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Identity' },
    { label: shortId(id) },
  ]);

  const identityQ = useIdentity(id);
  const balanceQ = useIdentityBalanceAndRevision(id);
  const keysQ = useIdentityKeys(id);
  const nonceQ = useIdentityNonce(id);
  const aliasesQ = useDpnsUsernames(id);
  const groupsQ = useIdentityGroups(id);
  const votesQ = useIdentityVotes(id);

  if (id === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Enter a real identity ID in the URL, or use the global search in the navbar.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const identity = identityQ.data as Record<string, unknown> | null | undefined;
  const balanceAndRevision = balanceQ.data as
    | { balance?: bigint; revision?: bigint | number }
    | null
    | undefined;
  const keys = (keysQ.data as unknown[] | null | undefined) ?? undefined;
  const aliases = (aliasesQ.data as string[] | null | undefined) ?? undefined;

  const isLoading = identityQ.isLoading || balanceQ.isLoading;
  const notFound =
    !isLoading &&
    identityQ.isSuccess &&
    (identity === null || identity === undefined);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {isLoading ? (
          <LoadingCard lines={6} />
        ) : identityQ.isError ? (
          <ErrorCard error={identityQ.error} onRetry={() => identityQ.refetch()} />
        ) : notFound ? (
          <NotFoundCard
            title="Identity not found"
            description={`No identity with id ${shortId(id)} on this network.`}
            actions={[
              { label: 'Reverse lookup by public key', href: `/identity/lookup/${id}/` },
              { label: 'Return home', href: '/' },
            ]}
          />
        ) : (
          <>
            <IdentityDigestCard
              id={id}
              balance={balanceAndRevision?.balance ?? null}
              revision={balanceAndRevision?.revision ?? null}
              nonce={(nonceQ.data as bigint | null | undefined) ?? null}
            />

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Keys</Tab>
                <Tab fontSize="sm">DPNS</Tab>
                <Tab fontSize="sm">Tokens</Tab>
                <Tab fontSize="sm">Groups</Tab>
                <Tab fontSize="sm">Votes</Tab>
                <Tab fontSize="sm">Advanced</Tab>
              </TabList>

              <TabPanels>
                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Public keys" />
                    {keysQ.isLoading ? (
                      <LoadingCard lines={3} />
                    ) : keysQ.isError ? (
                      <ErrorCard error={keysQ.error} onRetry={() => keysQ.refetch()} />
                    ) : (
                      <PublicKeysTable keys={keys as never} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="DPNS names" />
                    {aliasesQ.isLoading ? (
                      <LoadingCard lines={2} />
                    ) : (
                      <AliasesList names={aliases} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Tokens" />
                    <Text fontSize="sm" color="gray.400">
                      Token balances for identities will arrive in Stage 3. For now this tab
                      would call <code>tokens.identityBalances</code> against a known token list.
                    </Text>
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Group memberships" />
                    {groupsQ.isLoading ? (
                      <LoadingCard lines={2} />
                    ) : groupsQ.isError ? (
                      <ErrorCard error={groupsQ.error} onRetry={() => groupsQ.refetch()} />
                    ) : (
                      <CodeBlock value={groupsQ.data ?? 'No groups'} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Votes on contested resources" />
                    {votesQ.isLoading ? (
                      <LoadingCard lines={2} />
                    ) : votesQ.isError ? (
                      <ErrorCard error={votesQ.error} onRetry={() => votesQ.refetch()} />
                    ) : (
                      <CodeBlock value={votesQ.data ?? 'No votes recorded'} />
                    )}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Advanced" />
                    <HStack align="flex-start" spacing={8} flexWrap="wrap">
                      <AdvancedNonceLookup identityId={id} />
                    </HStack>
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
