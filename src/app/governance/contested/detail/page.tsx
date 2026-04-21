'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Heading, HStack, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { DateBlock } from '@components/data/DateBlock';
import { CodeBlock } from '@components/data/CodeBlock';
import { VoteTallyBar } from '@components/governance/VoteTallyBar';
import { ContenderCard } from '@components/governance/ContenderCard';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContestedResourceVoteState } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { readProp } from '@util/sdk-shape';

function parseIndexValues(raw: string): unknown[] | null {
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

function Content() {
  const params = useSearchParams();
  const contractId = params.get('contract') ?? '';
  const docType = params.get('docType') ?? '';
  const indexName = params.get('indexName') ?? '';
  const indexValuesRaw = params.get('indexValues') ?? '';
  const indexValues = indexValuesRaw ? parseIndexValues(indexValuesRaw) : null;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Governance' },
    { label: 'Contested', href: '/governance/contested/' },
    { label: docType || '—' },
    { label: indexValues ? indexValues.join(' / ') : '—' },
  ]);

  const q = useContestedResourceVoteState(
    contractId || undefined,
    docType || undefined,
    indexName || undefined,
    indexValues ?? undefined,
  );

  if (!contractId || !docType || !indexName || !indexValues) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide <code>?contract=…&amp;docType=…&amp;indexName=…&amp;indexValues=…</code>.
            <code>indexValues</code> must be a URL-encoded JSON array.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const data = q.data;
  const contenders = (readProp<unknown[]>(data, 'contenders') as unknown[] | undefined) ?? [];
  const abstainVotes = Number(readProp<number | bigint>(data, 'abstainVoteTally') ?? 0);
  const lockVotes = Number(readProp<number | bigint>(data, 'lockVoteTally') ?? 0);
  const finishedAtMs = readProp<number | bigint>(data, 'finishedAtMs');
  const winner = readProp<unknown>(data, 'winner');
  const winnerIdRaw =
    readProp<string>(winner, 'identityId') ??
    readProp<string>(winner, 'towardsIdentity');
  const winnerId = winnerIdRaw ? String(winnerIdRaw) : undefined;

  const finishedAtNum = finishedAtMs !== undefined ? Number(finishedAtMs) : null;
  const isFinished = winnerId !== undefined || (finishedAtNum !== null && finishedAtNum <= Date.now());

  const contenderVoteCounts = contenders.map((c) =>
    Number(readProp<number | bigint>(c, 'voteTally') ?? 0),
  );
  const towardsTotal = contenderVoteCounts.reduce((a, b) => a + b, 0);
  const totalVotes = towardsTotal + abstainVotes + lockVotes;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <HStack spacing={3} flexWrap="wrap" align="center">
              <Heading size="md" color="gray.100">
                Contested resource
              </Heading>
              {data ? (
                <Badge
                  colorScheme={isFinished ? 'gray' : 'green'}
                  variant="subtle"
                  fontSize="xs"
                >
                  {isFinished ? 'Finished' : 'Active'}
                </Badge>
              ) : null}
            </HStack>
            <HStack spacing={6} flexWrap="wrap">
              <InfoLine
                label="Contract"
                value={
                  <Identifier
                    value={contractId}
                    href={`/contract/?id=${encodeURIComponent(contractId)}`}
                    dense
                    avatar={false}
                  />
                }
              />
              <InfoLine label="Document type" value={<Text fontFamily="mono">{docType}</Text>} />
              <InfoLine label="Index" value={<Text fontFamily="mono">{indexName}</Text>} />
              <InfoLine
                label="Values"
                value={
                  <Text fontFamily="mono">
                    {indexValues.map((v) => String(v)).join(' / ')}
                  </Text>
                }
              />
            </HStack>
            {data ? (
              <HStack spacing={6} flexWrap="wrap">
                {finishedAtNum !== null ? (
                  <InfoLine
                    label={isFinished ? 'Ended' : 'Voting ends'}
                    value={<DateBlock value={finishedAtNum} relative />}
                  />
                ) : null}
                <InfoLine
                  label="Total votes"
                  value={
                    <Text fontFamily="mono" fontSize="xs" color="gray.100">
                      {totalVotes}
                    </Text>
                  }
                />
                <InfoLine
                  label="Contenders"
                  value={
                    <Text fontFamily="mono" fontSize="xs" color="gray.100">
                      {contenders.length}
                    </Text>
                  }
                />
              </HStack>
            ) : null}
          </VStack>
        </InfoBlock>

        {q.isLoading ? (
          <LoadingCard lines={6} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : !data ? (
          <InfoBlock>
            <Text color="gray.400" fontSize="sm">
              No vote state returned. The contest may be closed or the index values may
              not match.
            </Text>
          </InfoBlock>
        ) : (
          <>
            <InfoBlock>
              <VStack align="stretch" spacing={4}>
                <Heading size="sm" color="gray.100">
                  Tally
                </Heading>
                <VoteTallyBar
                  segments={[
                    { label: 'towards identity', count: towardsTotal, color: 'success' },
                    { label: 'abstain', count: abstainVotes, color: 'warning' },
                    { label: 'lock', count: lockVotes, color: 'danger' },
                  ]}
                />
              </VStack>
            </InfoBlock>

            <InfoBlock>
              <Heading size="sm" color="gray.100" mb={3}>
                Contenders ({contenders.length})
              </Heading>
              {contenders.length === 0 ? (
                <Text color="gray.400" fontSize="sm">
                  No contenders.
                </Text>
              ) : (
                <Wrap spacing={3}>
                  {contenders.map((c, i) => {
                    const towardsId = String(
                      readProp<string>(c, 'identityId') ??
                        readProp<string>(c, 'towardsIdentity') ??
                        `unknown-${i}`,
                    );
                    const balance = readProp<bigint | number>(c, 'prefundedBalance');
                    const voteCount = Number(readProp<number | bigint>(c, 'voteTally') ?? 0);
                    return (
                      <WrapItem key={`${towardsId}-${i}`}>
                        <ContenderCard
                          identityId={towardsId}
                          prefundedBalance={
                            balance !== undefined && balance !== null
                              ? typeof balance === 'bigint'
                                ? balance
                                : BigInt(String(balance))
                              : null
                          }
                          voteCount={voteCount}
                          isWinner={winnerId !== undefined && towardsId === winnerId}
                        />
                      </WrapItem>
                    );
                  })}
                </Wrap>
              )}
            </InfoBlock>

            <InfoBlock>
              <Heading size="sm" color="gray.100" mb={3}>
                Raw vote state
              </Heading>
              <CodeBlock value={data} />
            </InfoBlock>
          </>
        )}
        <Text fontSize="xs" color="gray.500">
          Contested resource: {shortId(contractId)} · {docType} · {indexName}
        </Text>
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
