'use client';

import { Suspense, useMemo } from 'react';
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
import { useContestedResourceVoteState, useVotePollsByEndDate } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { readProp, idToString } from '@util/sdk-shape';
import { toPlain } from '@util/contract';
import { safeStringify } from '@util/wasm-json';

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

  // Fetch vote polls ending in the next 90 days to find this contest's end date.
  const nowBucket = useMemo(() => Math.floor(Date.now() / 60_000) * 60_000, []);
  const pollsQ = useVotePollsByEndDate(nowBucket, nowBucket + 90 * 86_400_000);
  const endDateMs = useMemo(() => {
    const entries = (pollsQ.data as unknown[] | undefined) ?? [];
    const ivJson = indexValues ? safeStringify(indexValues, 0) : '';
    for (const entry of entries) {
      const ts = readProp<bigint | number>(entry, 'timestampMs');
      const polls = (readProp<unknown[]>(entry, 'votePolls') as unknown[] | undefined) ?? [];
      for (const p of polls) {
        const plain = toPlain(p) as Record<string, unknown> | undefined;
        const nested =
          plain && typeof plain === 'object'
            ? ((plain.contestedDocumentResourceVotePoll as Record<string, unknown> | undefined) ??
              (plain.ContestedDocumentResourceVotePoll as Record<string, unknown> | undefined) ??
              plain)
            : undefined;
        const pContract = String(readProp<string>(nested, 'contractId') ?? readProp<string>(nested, 'dataContractId') ?? '');
        const pDocType = String(readProp<string>(nested, 'documentTypeName') ?? '');
        const pIndexName = String(readProp<string>(nested, 'indexName') ?? '');
        const pIndexValues = readProp<unknown[]>(nested, 'indexValues');
        const pIvJson = Array.isArray(pIndexValues) ? safeStringify(pIndexValues, 0) : '';
        if (pContract === contractId && pDocType === docType && pIndexName === indexName && pIvJson === ivJson) {
          return ts !== undefined ? Number(ts) : null;
        }
      }
    }
    return null;
  }, [pollsQ.data, contractId, docType, indexName, indexValues]);

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

  const winner = readProp<unknown>(data, 'winner');
  const winnerInfo = readProp<unknown>(winner, 'info');
  const winnerBlock = readProp<unknown>(winner, 'block');
  const winnerId = idToString(readProp<unknown>(winner, 'identityId'));
  const isLocked = readProp<boolean>(winnerInfo, 'isLocked') === true;
  const isWonByIdentity = readProp<boolean>(winnerInfo, 'isWonByIdentity') === true;
  const isFinished = winner !== undefined;
  const resolvedAtMs = winnerBlock ? Number(readProp<bigint | number>(winnerBlock, 'timeMs') ?? 0) : null;

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
                  colorScheme={isFinished ? (isLocked ? 'red' : 'gray') : 'green'}
                  variant="subtle"
                  fontSize="xs"
                >
                  {isFinished
                    ? isLocked
                      ? 'Locked'
                      : isWonByIdentity
                        ? 'Won'
                        : 'Finished'
                    : 'Active'}
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
              <HStack spacing={6} flexWrap="wrap" align="flex-start">
                {isFinished && resolvedAtMs ? (
                  <InfoLine
                    label="Resolved"
                    value={<DateBlock value={resolvedAtMs} relative />}
                  />
                ) : endDateMs !== null ? (
                  <InfoLine
                    label="Voting ends"
                    value={<DateBlock value={endDateMs} relative />}
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
                    const towardsId =
                      idToString(readProp<unknown>(c, 'identityId')) ??
                      idToString(readProp<unknown>(c, 'towardsIdentity')) ??
                      `unknown-${i}`;
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
