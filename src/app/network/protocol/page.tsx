'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Heading,
  HStack,
  SimpleGrid,
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
import { InfoLine } from '@components/data/InfoLine';
import { Identifier } from '@components/data/Identifier';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { VoteTallyBar } from '@components/governance/VoteTallyBar';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useProtocolVersionUpgradeState,
  useProtocolVersionUpgradeVoteStatus,
} from '@sdk/queries';
import { readProp } from '@util/sdk-shape';

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Protocol' }]);

  const stateQ = useProtocolVersionUpgradeState();
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];
  const votesQ = useProtocolVersionUpgradeVoteStatus(startAfter, 100);

  const current = readProp<unknown>(stateQ.data, 'currentProtocolVersion');
  const pending = readProp<unknown>(stateQ.data, 'nextProtocolVersion');
  const activation = readProp<unknown>(stateQ.data, 'activationBlockHeight');

  const votesEntries = useMemo(() => {
    const m = votesQ.data;
    if (!(m instanceof Map)) return [];
    return [...m.entries()].map(([k, v]) => ({
      proTxHash: typeof k === 'string' ? k : String(k),
      vote: v,
    }));
  }, [votesQ.data]);

  // ProtocolVersionUpgradeVoteStatus is a WASM class exposing `.version: number`
  // and `.proTxHash`. Stringifying the instance gives `[object Object]`, so we
  // classify by comparing the voted version against the current protocol
  // version: a vote > current is "accepted", < current is "rejected",
  // == current (or null) is "abstained".
  const currentVersion = (() => {
    const n = Number(current);
    return Number.isFinite(n) ? n : null;
  })();

  const tally = useMemo(() => {
    let accepted = 0;
    let abstained = 0;
    let rejected = 0;
    if (currentVersion === null) {
      return { accepted: 0, abstained: votesEntries.length, rejected: 0 };
    }
    for (const { vote } of votesEntries) {
      const raw = readProp<number | bigint>(vote, 'version');
      if (raw === undefined || raw === null) {
        abstained += 1;
        continue;
      }
      const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
      if (!Number.isFinite(n)) abstained += 1;
      else if (n > currentVersion) accepted += 1;
      else if (n < currentVersion) rejected += 1;
      else abstained += 1;
    }
    return { accepted, abstained, rejected };
  }, [votesEntries, currentVersion]);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Protocol version
          </Heading>
        </InfoBlock>

        {stateQ.isLoading ? (
          <LoadingCard />
        ) : stateQ.isError ? (
          <ErrorCard error={stateQ.error} onRetry={() => stateQ.refetch()} />
        ) : (
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
            <InfoBlock>
              <InfoLine
                label="Current version"
                value={
                  <Text fontFamily="mono" fontSize="2xl" color="gray.100">
                    {current !== undefined ? String(current) : '—'}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Pending version"
                value={
                  <Text fontFamily="mono" fontSize="2xl" color={pending ? 'warning' : 'gray.400'}>
                    {pending !== undefined ? String(pending) : '—'}
                  </Text>
                }
              />
            </InfoBlock>
            <InfoBlock>
              <InfoLine
                label="Activation height"
                value={
                  <Text fontFamily="mono" fontSize="md" color="gray.100">
                    {activation !== undefined ? String(activation) : '—'}
                  </Text>
                }
              />
            </InfoBlock>
          </SimpleGrid>
        )}

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Masternode upgrade vote (current page, {votesEntries.length} rows)
            </Heading>
            <VoteTallyBar
              variant="protocol"
              segments={[
                { label: 'accepted', count: tally.accepted, color: 'success' },
                { label: 'abstained', count: tally.abstained, color: 'warning' },
                { label: 'rejected', count: tally.rejected, color: 'danger' },
              ]}
            />
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {votesQ.isLoading ? (
            <LoadingCard lines={6} />
          ) : votesQ.isError ? (
            <ErrorCard error={votesQ.error} onRetry={() => votesQ.refetch()} />
          ) : votesEntries.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No votes recorded in this page.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">
                      proTxHash
                    </Th>
                    <Th color="gray.400" borderColor="gray.750">
                      Vote
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {votesEntries.map((row) => (
                    <Tr key={row.proTxHash} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750">
                        <Identifier
                          value={row.proTxHash}
                          href={`/evonode/${row.proTxHash}/`}
                          avatar
                          dense
                        />
                      </Td>
                      <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" color="gray.250">
                        {typeof row.vote === 'object' ? JSON.stringify(row.vote) : String(row.vote)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
          <HStack justify="flex-end" mt={3}>
            <CursorPagination
              pageIndex={cursorStack.length - 1}
              hasPrev={cursorStack.length > 1}
              hasNext={votesEntries.length === 100}
              onPrev={() => setCursorStack((s) => s.slice(0, -1))}
              onNext={() => {
                const last = votesEntries[votesEntries.length - 1]?.proTxHash;
                if (last) setCursorStack((s) => [...s, last]);
              }}
            />
          </HStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
