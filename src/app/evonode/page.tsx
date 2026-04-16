'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { CodeBlock } from '@components/data/CodeBlock';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useCurrentEpoch,
  useEvonodesBlocksByIds,
  useProtocolVersionUpgradeVoteStatus,
} from '@sdk/queries';
import { shortId } from '@util/identifier';
import { normaliseEpoch } from '@util/epoch';

function Content() {
  const params = useSearchParams();
  const proTxHash = params.get('proTxHash') ?? '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Evonode' },
    { label: proTxHash ? shortId(proTxHash) : '—' },
  ]);

  const currentQ = useCurrentEpoch();
  const currentIdx = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;
  const blocksQ = useEvonodesBlocksByIds(
    proTxHash ? currentIdx : undefined,
    proTxHash ? [proTxHash] : undefined,
  );
  const voteQ = useProtocolVersionUpgradeVoteStatus(undefined, 100);

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

  const blocksMap = blocksQ.data as Map<string, bigint | number> | undefined;
  const myBlocks = blocksMap
    ? (() => {
        for (const [key, val] of blocksMap) {
          if (String(key) === proTxHash) return typeof val === 'bigint' ? Number(val) : Number(val);
        }
        return 0;
      })()
    : null;

  const voteMap = voteQ.data as Map<string, unknown> | undefined;
  const myVote = voteMap
    ? (() => {
        for (const [key, val] of voteMap) {
          if (String(key) === proTxHash) return val;
        }
        return undefined;
      })()
    : undefined;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading size="md" color="gray.100">
              Evonode
            </Heading>
            <Identifier value={proTxHash} avatar copy highlight="both" />
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <Wrap spacing={10}>
            <WrapItem>
              <InfoLine
                label="Current epoch"
                value={
                  <Text fontFamily="mono" fontSize="md" color="gray.100">
                    #{currentIdx ?? '—'}
                  </Text>
                }
              />
            </WrapItem>
            <WrapItem>
              <InfoLine
                label="Blocks proposed (current epoch)"
                value={<BigNumberDisplay value={myBlocks} />}
              />
            </WrapItem>
          </Wrap>
        </InfoBlock>

        <InfoBlock>
          <Heading size="sm" color="gray.100" mb={3}>
            Protocol upgrade vote
          </Heading>
          {voteQ.isLoading ? (
            <LoadingCard lines={2} />
          ) : voteQ.isError ? (
            <ErrorCard error={voteQ.error} onRetry={() => voteQ.refetch()} />
          ) : myVote === undefined ? (
            <Text color="gray.400" fontSize="sm">
              No vote recorded for this evonode in the first 100 masternodes scanned.
            </Text>
          ) : (
            <CodeBlock value={myVote} />
          )}
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
