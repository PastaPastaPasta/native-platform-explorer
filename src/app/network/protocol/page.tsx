'use client';

import { useMemo } from 'react';
import {
  Box,
  Heading,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { Identifier } from '@components/data/Identifier';
import { WalkCapNotice } from '@components/data/WalkCapNotice';
import { SortableTh, useSortState, useSortedRows } from '@components/data/SortableTh';
import { VoteTallyBar, type TallySegment } from '@components/governance/VoteTallyBar';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import {
  useAllEvonodeBlocksInEpoch,
  useAllProtocolVotes,
  useCurrentEpoch,
  useFinalizedEpochInfo,
  useProtocolVersionUpgradeState,
} from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';
import { tallyProtocolVotes, upgradeCandidates } from '@util/protocol-votes';
import { readProp } from '@util/sdk-shape';

function versionColor(version: number, current: number | null): string {
  if (current === null || version === current) return 'blue.400';
  return version > current ? 'success' : 'danger';
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Protocol' }]);
  usePageTitle('Protocol version');

  const stateQ = useProtocolVersionUpgradeState();
  const currentQ = useCurrentEpoch();
  const votesQ = useAllProtocolVotes();

  // The running version comes from the current epoch record. rc.2's
  // versionUpgradeState() reports both versions relative to the SDK's
  // built-in version, so it is only shown as a discrepancy note.
  const epochIdx = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;
  const epochProtocol = readProp<number>(currentQ.data, 'protocolVersion');
  const current = typeof epochProtocol === 'number' ? epochProtocol : null;
  const reportedCurrent = readProp<number>(stateQ.data, 'currentProtocolVersion');

  // Platform exposes no masternode list. Evonodes are known from their votes
  // and from block proposals in the previous (finalized) and current epochs.
  // Votes are cast by proposing blocks and reset each epoch (seen live on
  // testnet: 25 voters at the end of one hourly epoch, 5 early in the next).
  const prevIdx = epochIdx !== undefined && epochIdx > 0 ? epochIdx - 1 : undefined;
  const liveQ = useAllEvonodeBlocksInEpoch(epochIdx);
  const prevQ = useFinalizedEpochInfo(prevIdx);
  const prevProposers = readProp<unknown>(
    prevQ.data instanceof Map && prevIdx !== undefined ? prevQ.data.get(prevIdx) : undefined,
    'blockProposers',
  );
  const knownReady = liveQ.isSuccess && (prevIdx === undefined || prevQ.isSuccess);

  const votes = votesQ.data;
  const tally = useMemo(() => {
    if (!votes) return null;
    const known: string[] = [];
    if (liveQ.data instanceof Map) known.push(...liveQ.data.keys());
    if (prevProposers instanceof Map) for (const k of prevProposers.keys()) known.push(String(k));
    return tallyProtocolVotes(votes, known);
  }, [votes, liveQ.data, prevProposers]);

  // A pending upgrade is any voted version above the current one; the
  // most-voted is the likeliest next version. Unknown without both inputs.
  const candidates = tally && current !== null ? upgradeCandidates(tally, current) : null;
  const pending = candidates?.[0] ?? null;
  const others = (candidates ?? []).slice(1).map((c) => `v${c.version} (${c.count})`);
  const nextNote =
    candidates === null
      ? currentQ.isError ? 'needs the current version' : undefined
      : pending
        ? `most-voted version above v${current}${others.length > 0 ? `; also voted: ${others.join(', ')}` : ''}`
        : `no recorded vote above v${current} this epoch`;

  const segments: TallySegment[] = tally
    ? [
        ...tally.byVersion.map(({ version, count }) => ({
          label: `v${version}${version === current ? ' (current)' : version === pending?.version ? ' (next)' : ''}`,
          count,
          color: versionColor(version, current),
        })),
        ...(knownReady ? [{ label: 'no vote yet', count: tally.unvoted, color: 'gray.600' }] : []),
      ]
    : [];
  const unknownText = (q: { isLoading: boolean }) => (q.isLoading ? '…' : 'unknown');

  const rows = useMemo(() => (votes ? [...votes.entries()] : []), [votes]);
  const { sort, toggle } = useSortState<'hash' | 'vote'>({ key: 'hash', direction: 'asc' });
  const sortedRows = useSortedRows(rows, sort, {
    hash: ([hash]) => hash,
    vote: ([, version]) => Number(version),
  });

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Protocol version
          </Heading>
        </InfoBlock>

        {currentQ.isError ? (
          <ErrorCard
            title="Current epoch unavailable"
            error={currentQ.error}
            onRetry={() => currentQ.refetch()}
          />
        ) : null}
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <InfoBlock>
            <InfoLine
              label="Current version"
              description={epochIdx !== undefined ? `from epoch #${epochIdx}` : undefined}
              value={
                <Text fontFamily="mono" fontSize="2xl" color={current !== null ? 'gray.100' : 'gray.400'}>
                  {current !== null ? `v${current}` : unknownText(currentQ)}
                </Text>
              }
            />
          </InfoBlock>
          <InfoBlock>
            <InfoLine
              label="Next version"
              description={nextNote}
              value={
                <Text fontFamily="mono" fontSize="2xl" color={pending ? 'warning' : 'gray.400'}>
                  {candidates === null
                    ? unknownText(current === null ? currentQ : votesQ)
                    : pending
                      ? `v${pending.version}`
                      : 'none voted'}
                </Text>
              }
            />
          </InfoBlock>
          <InfoBlock>
            <InfoLine
              label={pending ? `Votes for v${pending.version}` : 'Voters'}
              description={pending && knownReady && tally ? `of ${tally.known} known evonodes` : undefined}
              value={
                <Text fontFamily="mono" fontSize="2xl" color="gray.100">
                  {pending ? pending.count : tally?.voted ?? unknownText(votesQ)}
                </Text>
              }
            />
          </InfoBlock>
        </SimpleGrid>
        {typeof reportedCurrent === 'number' && current !== null && reportedCurrent !== current ? (
          <Text fontSize="xs" color="gray.400">
            The SDK&apos;s versionUpgradeState reports currentProtocolVersion v{reportedCurrent}, which
            disagrees with the current epoch record (v{current}); this page uses the epoch record and
            reads the next version from the votes below.
          </Text>
        ) : null}

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Evonode upgrade votes
            </Heading>
            {votesQ.isLoading ? (
              <LoadingCard lines={2} />
            ) : votesQ.isError ? (
              <ErrorCard error={votesQ.error} onRetry={() => votesQ.refetch()} />
            ) : tally ? (
              <>
                <VoteTallyBar variant="protocol" segments={segments} />
                <WalkCapNotice data={votes} what="the vote list" />
                <WalkCapNotice data={liveQ.data} what="current-epoch proposers" />
                <Text fontSize="xs" color="gray.400">
                  {knownReady ? (
                    <>
                      Denominator: {tally.known} known evonodes — every proTxHash with a recorded
                      vote, plus every evonode that proposed a block in{' '}
                      {prevProposers instanceof Map ? `finalized epoch #${prevIdx} or ` : ''}the current
                      epoch #{epochIdx}. An evonode records its vote when it proposes a block, and
                      votes reset each epoch, so &ldquo;no vote yet&rdquo; shrinks as the epoch
                      fills. Platform does not expose the masternode list, so evonodes that
                      have not proposed recently are not counted.
                    </>
                  ) : currentQ.isError ? (
                    <>
                      Showing {tally.voted} recorded votes. The current epoch could not be read on
                      this network, so recent proposers, and evonodes without a vote, are unknown.
                    </>
                  ) : liveQ.isError || prevQ.isError ? (
                    <>
                      Showing {tally.voted} recorded votes. Recent proposers could not be loaded,
                      so evonodes without a vote cannot be counted.
                    </>
                  ) : (
                    <>Counting {tally.voted} recorded votes; reading recent proposers to find evonodes without a vote…</>
                  )}
                </Text>
              </>
            ) : null}
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {votesQ.isLoading ? (
            <LoadingCard lines={6} />
          ) : votesQ.isError ? null : rows.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No votes recorded.
            </Text>
          ) : (
            <Box overflowX="auto" maxH="560px" overflowY="auto">
              <Table size="sm">
                <Thead position="sticky" top={0} bg="surface" zIndex={1}>
                  <Tr>
                    <SortableTh column="hash" sort={sort} onSort={toggle} color="gray.400" borderColor="gray.750">
                      proTxHash ({rows.length})
                    </SortableTh>
                    <SortableTh column="vote" sort={sort} onSort={toggle} firstDirection="desc" color="gray.400" borderColor="gray.750">
                      Vote
                    </SortableTh>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedRows.map(([hash, version]) => (
                    <Tr key={hash} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750">
                        <Identifier
                          value={hash}
                          href={`/evonode/?proTxHash=${encodeURIComponent(hash)}`}
                          avatar
                          dense
                        />
                      </Td>
                      <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" color="gray.250">
                        v{version}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
