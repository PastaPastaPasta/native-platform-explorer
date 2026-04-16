'use client';

import NextLink from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { NotActive } from '@components/data/NotActive';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useAllEvonodeBlocksInEpoch,
  useCurrentEpoch,
  useProtocolVersionUpgradeVoteStatus,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { normaliseEpoch } from '@util/epoch';
import { useSdk } from '@sdk/hooks';

function Content() {
  const params = useSearchParams();
  const proTxHash = params.get('proTxHash') ?? '';
  const { network } = useSdk();

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Evonode' },
    { label: proTxHash ? shortId(proTxHash) : '—' },
  ]);

  const currentQ = useCurrentEpoch();
  const currentIdx = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;

  // Paginate through every proposer for the current epoch (server caps each
  // page at 100). Gives us rank + share + block count in one walk.
  const allBlocksQ = useAllEvonodeBlocksInEpoch(proTxHash ? currentIdx : undefined);
  const allBars = (() => {
    const m = allBlocksQ.data as Map<string, number> | undefined;
    if (!m) return [] as Array<{ proTxHash: string; blocks: number }>;
    return [...m.entries()]
      .map(([p, b]) => ({ proTxHash: p, blocks: b }))
      .sort((a, b) => b.blocks - a.blocks);
  })();
  const myIndex = allBars.findIndex((b) => b.proTxHash === proTxHash);
  const myEntry = myIndex >= 0 ? allBars[myIndex] : null;
  const total = allBars.reduce((a, b) => a + b.blocks, 0);
  const topBlocks = allBars[0]?.blocks ?? 0;
  const sharePct = total > 0 && myEntry ? (myEntry.blocks / total) * 100 : 0;

  // Protocol-upgrade vote status: paginated across all masternodes. We only
  // scan the first 100 in Stage 5; if this evonode is beyond page 1 the vote
  // won't appear. Label the result honestly.
  const voteQ = useProtocolVersionUpgradeVoteStatus(undefined, 100);
  const voteMap = voteQ.data as Map<string, unknown> | undefined;
  const myVote = voteMap
    ? (() => {
        for (const [key, val] of voteMap) {
          if (String(key) === proTxHash) return val;
        }
        return undefined;
      })()
    : undefined;

  const l1InsightBase =
    network === 'mainnet'
      ? 'https://insight.dash.org/insight'
      : 'http://insight.testnet.networks.dash.org/insight';

  if (!proTxHash) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide a proTxHash as <code>?proTxHash=…</code>.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" flexWrap="wrap" spacing={3}>
              <Heading size="md" color="gray.100">
                Evonode
              </Heading>
              {currentIdx !== undefined ? (
                <Button
                  as={NextLink}
                  href={`/epoch/detail/?index=${currentIdx}`}
                  size="xs"
                  variant="outline"
                >
                  Epoch #{currentIdx}
                </Button>
              ) : null}
            </HStack>
            <Identifier value={proTxHash} avatar copy highlight="both" />
          </VStack>
        </InfoBlock>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <InfoBlock>
            <InfoLine
              label="Blocks proposed (current epoch)"
              value={
                allBlocksQ.isLoading ? (
                  <Text fontSize="sm" color="gray.400">
                    Scanning…
                  </Text>
                ) : allBlocksQ.isError ? (
                  <Text fontSize="sm" color="danger">
                    {allBlocksQ.error?.message ?? 'Failed to load'}
                  </Text>
                ) : myEntry ? (
                  <VStack align="flex-start" spacing={1}>
                    <BigNumberDisplay value={myEntry.blocks} />
                    {topBlocks > 0 ? (
                      <Progress
                        value={(myEntry.blocks / topBlocks) * 100}
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
                      Not a proposer so far this epoch.
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
                myEntry ? (
                  <Text fontFamily="mono" fontSize="md" color="gray.100">
                    #{myIndex + 1}{' '}
                    <Text as="span" color="gray.400" fontSize="xs">
                      of {allBars.length}
                    </Text>
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
          </InfoBlock>
          <InfoBlock>
            <InfoLine
              label="Share of blocks this epoch"
              value={
                myEntry ? (
                  <Text fontFamily="mono" fontSize="md" color="gray.100">
                    {sharePct.toFixed(2)}%{' '}
                    <Text as="span" color="gray.400" fontSize="xs">
                      ({myEntry.blocks}/{total})
                    </Text>
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
          </InfoBlock>
        </SimpleGrid>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Heading size="sm" color="gray.100">
                Protocol upgrade vote
              </Heading>
              <Badge variant="subtle" colorScheme="gray" fontSize="2xs" textTransform="none">
                first 100 masternodes scanned
              </Badge>
            </HStack>
            {voteQ.isLoading ? (
              <LoadingCard lines={2} />
            ) : voteQ.isError ? (
              <ErrorCard error={voteQ.error} onRetry={() => voteQ.refetch()} />
            ) : myVote === undefined ? (
              <Text color="gray.400" fontSize="sm">
                No vote recorded for this evonode in the first 100 masternodes scanned.
                Paginating through more pages is tracked as a follow-up.
              </Text>
            ) : (
              <CodeBlock value={myVote} />
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
              href={`${l1InsightBase}/tx/${proTxHash}`}
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
