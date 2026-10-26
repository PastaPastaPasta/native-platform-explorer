'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
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
import { IdentityTokensTab } from '@components/identity/IdentityTokensTab';
import { IdentityGroupsTab } from '@components/identity/IdentityGroupsTab';
import { IdentityVotesTab } from '@components/identity/IdentityVotesTab';
import { ViewedIdentitiesBanner } from '@components/identity/ViewedIdentitiesBanner';
import { IdentityLanding } from '@components/identity/IdentityLanding';
import { IdentityDpnsNames } from '@components/identity/IdentityDpnsNames';
import { IdentityContractLookup } from '@components/identity/IdentityContractLookup';
import { ProofFailureBanner } from '@components/data/ProofFailureBanner';
import { WriteActions } from '@components/broadcast/WriteActions';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useTabParam } from '@hooks/useTabParam';
import {
  useIdentity,
  useIdentityBalanceAndRevision,
  useIdentityKeys,
  useIdentityNonce,
  useDpnsUsernames,
} from '@sdk/queries';
import { aggregateProof } from '@sdk/proofs';
import { shortId } from '@util/identifier';

function TabHeading({ label }: { label: string }) {
  return (
    <Text fontSize="sm" color="gray.100" fontWeight={600} mb={3}>
      {label}
    </Text>
  );
}

const TABS = ['keys', 'dpns', 'tokens', 'groups', 'votes', 'advanced'] as const;

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Identity' },
    { label: id ? shortId(id) : '—' },
  ]);

  const identityQ = useIdentity(id || undefined);
  const balanceQ = useIdentityBalanceAndRevision(id || undefined);
  const keysQ = useIdentityKeys(id || undefined);
  const nonceQ = useIdentityNonce(id || undefined);
  const aliasesQ = useDpnsUsernames(id || undefined);
  const tabs = useTabParam(TABS);

  if (!id) {
    return <IdentityLanding />;
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
              { label: 'Reverse lookup by public key', href: `/identity/lookup/?pkh=${id}` },
              { label: 'Return home', href: '/' },
            ]}
          />
        ) : (
          <>
            {(() => {
              const agg = aggregateProof([
                identityQ.proofState,
                balanceQ.proofState,
                keysQ.proofState,
                nonceQ.proofState,
                aliasesQ.proofState,
              ]);
              return (
                <>
                  <ProofFailureBanner
                    proofState={agg}
                    onRetry={() => {
                      identityQ.refetch();
                      balanceQ.refetch();
                      keysQ.refetch();
                      nonceQ.refetch();
                      aliasesQ.refetch();
                    }}
                  />
                  <IdentityDigestCard
                    id={id}
                    balance={balanceAndRevision?.balance ?? null}
                    revision={balanceAndRevision?.revision ?? null}
                    nonce={(nonceQ.data as bigint | null | undefined) ?? null}
                    aliases={aliases}
                    proofState={agg}
                  />
                </>
              );
            })()}
            <ViewedIdentitiesBanner identityId={id} />
            <WriteActions
              size="xs"
              title="Actions"
              links={[
                { op: 'identity.topUp', label: 'Top up' },
                {
                  op: 'identity.creditTransfer',
                  label: 'Transfer credits',
                  ownsTo: id,
                },
                {
                  op: 'identity.creditWithdrawal',
                  label: 'Withdraw',
                  ownsTo: id,
                },
                {
                  op: 'identity.updateKeys',
                  label: 'Update keys',
                  ownsTo: id,
                },
                {
                  op: 'dpns.registerName',
                  label: 'Register name',
                  ownsTo: id,
                },
              ]}
            />

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy index={tabs.index} onChange={tabs.onChange}>
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
                    {aliasesQ.isLoading ? <LoadingCard lines={2} /> : <IdentityDpnsNames names={aliases} />}
                  </InfoBlock>
                </TabPanel>

                <TabPanel px={0}>
                  <IdentityTokensTab identityId={id} />
                </TabPanel>
                <TabPanel px={0}>
                  <IdentityGroupsTab identityId={id} />
                </TabPanel>
                <TabPanel px={0}>
                  <IdentityVotesTab identityId={id} />
                </TabPanel>

                <TabPanel px={0}>
                  <InfoBlock>
                    <TabHeading label="Advanced" />
                    <IdentityContractLookup identityId={id} />
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
