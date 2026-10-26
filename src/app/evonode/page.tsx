'use client';

import NextLink from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Heading,
  HStack,
  Progress,
  Select,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { LookupInput } from '@ui/LookupInput';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { NotActive } from '@components/data/NotActive';
import { WalkCapNotice } from '@components/data/WalkCapNotice';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useAllEvonodeBlocksInEpoch,
  useCurrentEpoch,
  useEvonodesBlocksByIds,
  useFinalizedEpochInfo,
  useProtocolVersionUpgradeVoteStatus,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { normaliseEpoch, proposerStanding, type ProposerStanding } from '@util/epoch';
import { proposerMapByHex, proTxHashToBase58, proTxHashToHex } from '@util/protx';
import { findOwnVote } from '@util/protocol-votes';
import { readProp } from '@util/sdk-shape';
import { useSdk } from '@sdk/hooks';
import { getNetwork } from '@sdk/networks';

// Recent epochs offered by the selector. Older epochs are reachable from
// /epoch/history/, whose finalized proposer lists link back here.
const EPOCH_CHOICES = 25;

function validateProTxHash(v: string): string | null {
  return proTxHashToHex(v) ? null : 'Expected a 64-character hex proTxHash (or its base58 form).';
}

function Landing({ invalid }: { invalid?: string }) {
  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading size="md" color="gray.100">
              Evonodes
            </Heading>
            {invalid ? (
              <Text fontSize="sm" color="danger">
                “{shortId(invalid, 12, 6)}” is not a proTxHash.
              </Text>
            ) : null}
            <LookupInput
              label="proTxHash"
              placeholder="64-character hex proTxHash"
              description="Shows the evonode's proposed blocks per epoch and its protocol-upgrade vote."
              validate={validateProTxHash}
              buildHref={(v) => `/evonode/?proTxHash=${encodeURIComponent(proTxHashToHex(v)!)}`}
            />
          </VStack>
        </InfoBlock>
        <InfoBlock>
          <HStack justify="space-between" flexWrap="wrap" spacing={3}>
            <Text fontSize="sm" color="gray.250">
              Don&apos;t have a proTxHash? Pick an evonode from the proposer leaderboard or the
              protocol vote list.
            </Text>
            <HStack spacing={2}>
              <Button as={NextLink} href="/epoch/" size="xs" variant="outline">
                Current epoch leaderboard →
              </Button>
              <Button as={NextLink} href="/network/protocol/" size="xs" variant="outline">
                Protocol votes →
              </Button>
            </HStack>
          </HStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}

function Standing({
  loading,
  error,
  rankError,
  standing,
  blocks,
  epochLabel,
}: {
  loading: boolean;
  error: Error | null;
  /** Why rank and share are missing when only the block count loaded. */
  rankError?: Error | null;
  standing: ProposerStanding | null;
  blocks: number | null;
  epochLabel: string;
}) {
  const missingRank = rankError ? (
    <Text fontSize="xs" color="danger">
      Ranking unavailable: {rankError.message || 'failed to load'}
    </Text>
  ) : (
    <NotActive />
  );
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
      <InfoBlock>
        <InfoLine
          label={`Blocks proposed (${epochLabel})`}
          value={
            loading ? (
              <Text fontSize="sm" color="gray.400">
                Scanning…
              </Text>
            ) : error ? (
              <Text fontSize="sm" color="danger">
                {error.message || 'Failed to load'}
              </Text>
            ) : blocks ? (
              <VStack align="flex-start" spacing={1}>
                <BigNumberDisplay value={blocks} />
                {standing && standing.topBlocks > 0 ? (
                  <Progress
                    value={(blocks / standing.topBlocks) * 100}
                    colorScheme="blue"
                    size="xs"
                    width="100%"
                    borderRadius="full"
                    bg="gray.800"
                  />
                ) : null}
              </VStack>
            ) : (
              <VStack align="flex-start" spacing={1}>
                <NotActive />
                <Text fontSize="xs" color="gray.400">
                  No blocks proposed in this epoch.
                </Text>
              </VStack>
            )
          }
        />
      </InfoBlock>
      <InfoBlock>
        <InfoLine
          label="Rank"
          value={
            !loading && standing ? (
              <Text fontFamily="mono" fontSize="md" color="gray.100">
                #{standing.rank}{' '}
                <Text as="span" color="gray.400" fontSize="xs">
                  of {standing.proposers} proposers
                </Text>
              </Text>
            ) : (
              missingRank
            )
          }
        />
      </InfoBlock>
      <InfoBlock>
        <InfoLine
          label="Share of blocks"
          value={
            !loading && standing && standing.totalBlocks > 0 ? (
              <Text fontFamily="mono" fontSize="md" color="gray.100">
                {((standing.blocks / standing.totalBlocks) * 100).toFixed(2)}%{' '}
                <Text as="span" color="gray.400" fontSize="xs">
                  ({standing.blocks}/{standing.totalBlocks})
                </Text>
              </Text>
            ) : (
              missingRank
            )
          }
        />
      </InfoBlock>
    </SimpleGrid>
  );
}

function Evonode({ hex }: { hex: string }) {
  const { network } = useSdk();
  const currentQ = useCurrentEpoch();
  const currentIdx = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;
  const currentProtocol = readProp<number>(currentQ.data, 'protocolVersion');
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const epoch = chosen ?? currentIdx;
  const isCurrent = epoch !== undefined && epoch === currentIdx;

  // Only the current epoch has live proposer data; earlier epochs return
  // empty maps and carry their proposers in the finalized record instead.
  const ids = useMemo(() => [hex], [hex]);
  const ownBlocksQ = useEvonodesBlocksByIds(isCurrent ? epoch : undefined, ids);
  const allBlocksQ = useAllEvonodeBlocksInEpoch(isCurrent ? epoch : undefined);
  const finalizedQ = useFinalizedEpochInfo(!isCurrent ? epoch : undefined);

  const ownBlocks = useMemo(() => {
    if (!(ownBlocksQ.data instanceof Map)) return null;
    return proposerMapByHex(ownBlocksQ.data).get(hex) ?? 0;
  }, [ownBlocksQ.data, hex]);
  const finalizedEntry =
    finalizedQ.data instanceof Map && epoch !== undefined ? finalizedQ.data.get(epoch) : undefined;
  const proposerSource = isCurrent
    ? allBlocksQ.data
    : readProp<unknown>(finalizedEntry, 'blockProposers');
  const standing = useMemo(
    () => proposerStanding(proposerMapByHex(proposerSource), hex),
    [proposerSource, hex],
  );
  // Count, rank and share all come from the complete map when it loaded, so
  // they cannot disagree; the by-id count is only a fallback for a failed walk.
  const walked = allBlocksQ.data instanceof Map;
  const currentBlocks = walked ? standing?.blocks ?? 0 : allBlocksQ.isError ? ownBlocks : null;

  // The vote page starts at the first hash ≥ this one; findOwnVote rejects a
  // successor's entry when this node has no vote.
  const voteQ = useProtocolVersionUpgradeVoteStatus(hex, 1);
  const myVote = findOwnVote(voteQ.data, hex);

  const base58 = proTxHashToBase58(hex);
  const l1InsightBase =
    getNetwork(network).l1ExplorerBaseUrl ??
    'http://insight.testnet.networks.dash.org/insight';
  const epochChoices =
    currentIdx === undefined
      ? []
      : Array.from({ length: Math.min(EPOCH_CHOICES, currentIdx + 1) }, (_, i) => currentIdx - i);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" flexWrap="wrap" spacing={3}>
              <Heading size="md" color="gray.100">
                Evonode
              </Heading>
              <HStack spacing={2}>
                <Text as="label" htmlFor="evonode-epoch" fontSize="xs" color="gray.400">
                  Epoch
                </Text>
                <Select
                  id="evonode-epoch"
                  size="xs"
                  width="auto"
                  value={epoch ?? ''}
                  isDisabled={currentIdx === undefined}
                  onChange={(e) => setChosen(Number(e.target.value))}
                >
                  {epochChoices.map((i) => (
                    <option key={i} value={i}>
                      #{i}
                      {i === currentIdx ? ' (current)' : ''}
                    </option>
                  ))}
                </Select>
                {epoch !== undefined ? (
                  <Button
                    as={NextLink}
                    href={`/epoch/detail/?index=${epoch}`}
                    size="xs"
                    variant="outline"
                  >
                    Epoch #{epoch} →
                  </Button>
                ) : null}
              </HStack>
            </HStack>
            <Identifier value={hex} avatar copy highlight="both" />
            {base58 ? (
              <Text fontSize="xs" color="gray.400" fontFamily="mono">
                base58 {base58}
              </Text>
            ) : null}
          </VStack>
        </InfoBlock>

        {currentQ.isError ? (
          <ErrorCard error={currentQ.error} onRetry={() => currentQ.refetch()} />
        ) : isCurrent || epoch === undefined ? (
          <VStack align="stretch" spacing={2}>
            <Standing
              epochLabel={epoch !== undefined ? `epoch #${epoch}, current` : 'current epoch'}
              loading={
                currentQ.isLoading || allBlocksQ.isLoading || (allBlocksQ.isError && ownBlocksQ.isLoading)
              }
              error={allBlocksQ.isError && ownBlocksQ.isError ? allBlocksQ.error : null}
              rankError={allBlocksQ.isError ? allBlocksQ.error : null}
              standing={standing}
              blocks={currentBlocks}
            />
            <WalkCapNotice data={allBlocksQ.data} what="current-epoch proposers" />
          </VStack>
        ) : finalizedQ.isError ? (
          <ErrorCard error={finalizedQ.error} onRetry={() => finalizedQ.refetch()} />
        ) : !finalizedQ.isLoading && !finalizedEntry ? (
          <InfoBlock>
            <Text color="gray.400" fontSize="sm">
              Epoch #{epoch} has no finalized record yet, and Platform keeps live proposer counts
              only for the current epoch.
            </Text>
          </InfoBlock>
        ) : (
          <Standing
            epochLabel={`epoch #${epoch}, finalized`}
            loading={finalizedQ.isLoading}
            error={null}
            standing={standing}
            blocks={standing?.blocks ?? 0}
          />
        )}

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Heading size="sm" color="gray.100">
                Protocol upgrade vote
                {currentIdx !== undefined ? (
                  <Text as="span" fontSize="xs" color="gray.400" fontWeight="normal" ml={2}>
                    current epoch #{currentIdx}
                  </Text>
                ) : null}
              </Heading>
              <Button as={NextLink} href="/network/protocol/" size="xs" variant="ghost">
                All votes →
              </Button>
            </HStack>
            {!isCurrent && epoch !== undefined ? (
              <Text fontSize="xs" color="gray.400">
                Votes reset at every epoch boundary and Platform keeps only the current
                epoch&apos;s, so this is the vote recorded in epoch #{currentIdx}, not #{epoch}.
              </Text>
            ) : null}
            {voteQ.isLoading ? (
              <LoadingCard lines={2} />
            ) : voteQ.isError ? (
              <ErrorCard error={voteQ.error} onRetry={() => voteQ.refetch()} />
            ) : myVote === null ? (
              <Text color="gray.400" fontSize="sm">
                No protocol version vote is recorded for this proTxHash this epoch. An evonode
                records its vote when it proposes a block, and votes reset each epoch.
              </Text>
            ) : (
              <HStack spacing={3} flexWrap="wrap">
                <Text fontFamily="mono" fontSize="2xl" color="gray.100">
                  v{myVote}
                </Text>
                {typeof currentProtocol === 'number' ? (
                  <Badge
                    variant="subtle"
                    colorScheme={
                      myVote > currentProtocol ? 'yellow' : myVote === currentProtocol ? 'green' : 'orange'
                    }
                    textTransform="none"
                  >
                    {myVote > currentProtocol
                      ? `upgrade from v${currentProtocol}`
                      : myVote === currentProtocol
                        ? 'current version'
                        : `behind current v${currentProtocol}`}
                  </Badge>
                ) : null}
                <Text fontSize="xs" color="gray.400">
                  voted by <Identifier value={hex} dense copy={false} avatar={false} />
                </Text>
              </HStack>
            )}
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <HStack justify="space-between" flexWrap="wrap" spacing={3}>
            <Text fontSize="xs" color="gray.400">
              proTxHash is a Core-layer masternode identifier. Cross-reference in the
              L1 insight explorer for transaction history and payout address.
            </Text>
            <Button
              as="a"
              href={`${l1InsightBase}/tx/${hex}`}
              target="_blank"
              rel="noreferrer"
              size="xs"
              variant="outline"
            >
              View in L1 explorer ↗
            </Button>
          </HStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}

function Content() {
  const params = useSearchParams();
  const raw = params.get('proTxHash') ?? '';
  const hex = proTxHashToHex(raw);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Evonode', href: hex ? '/evonode/' : undefined },
    ...(hex ? [{ label: shortId(hex) }] : []),
  ]);

  if (!hex) return <Landing invalid={raw.trim() ? raw : undefined} />;
  return <Evonode key={hex} hex={hex} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
