'use client';

import { Suspense, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
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
import { DateBlock } from '@components/data/DateBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useCurrentEpoch, useEpochRange } from '@sdk/queries';
import { epochRangeError, MAX_EPOCH_RANGE } from '@sdk/epoch-queries';
import { normaliseEpoch } from '@util/epoch';

function Content() {
  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Epoch', href: '/epoch/' },
    { label: 'History' },
  ]);

  const currentQ = useCurrentEpoch();
  const currentIdx = currentQ.data ? normaliseEpoch(currentQ.data).index : undefined;
  const [toInput, setToInput] = useState<string>('');
  const [fromInput, setFromInput] = useState<string>('');
  const to = toInput ? Number(toInput) : currentIdx;
  const from = fromInput ? Number(fromInput) : to === undefined ? undefined : Math.max(0, to - 19);
  const rangeError = from !== undefined && to !== undefined ? epochRangeError(from, to) : null;

  const q = useEpochRange(
    from,
    to,
  );

  const rows = useMemo(() => {
    if (!q.data) return [];
    if (!(q.data instanceof Map)) return [];
    return [...q.data.values()]
      .filter(Boolean)
      .map((v) => normaliseEpoch(v))
      .sort((a, b) => b.index - a.index);
  }, [q.data]);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              Epoch history
            </Heading>
            <Text fontSize="xs" color="gray.400">
              Inclusive range, up to {MAX_EPOCH_RANGE} epochs. Defaults to the 20 most recent epochs.
            </Text>
            <HStack spacing={2}>
              <Input
                size="sm"
                aria-label="Start epoch"
                placeholder={`from (default ${currentIdx === undefined ? 'pending' : Math.max(0, currentIdx - 19)})`}
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                width="180px"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Input
                size="sm"
                aria-label="End epoch"
                placeholder={`to (default ${currentIdx ?? 'pending'})`}
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                width="180px"
                bg="gray.800"
                borderColor="gray.700"
              />
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {rangeError ? (
            <Text role="alert" color="red.300" fontSize="sm">{rangeError}</Text>
          ) : !toInput && currentQ.isError ? (
            <ErrorCard error={currentQ.error} onRetry={() => currentQ.refetch()} />
          ) : (!toInput && currentQ.isLoading) || q.isLoading ? (
            <LoadingCard lines={5} />
          ) : q.isError ? (
            <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          ) : rows.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No epochs in this range.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">
                      Index
                    </Th>
                    <Th color="gray.400" borderColor="gray.750">
                      Start
                    </Th>
                    <Th color="gray.400" borderColor="gray.750">
                      End
                    </Th>
                    <Th color="gray.400" borderColor="gray.750">
                      Fees
                    </Th>
                    <Th borderColor="gray.750" />
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((r) => (
                    <Tr key={r.index} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750" fontFamily="mono">
                        #{r.index}
                      </Td>
                      <Td borderColor="gray.750">
                        <DateBlock value={r.startAtMs} />
                      </Td>
                      <Td borderColor="gray.750">
                        <DateBlock value={r.endAtMs} />
                      </Td>
                      <Td borderColor="gray.750" fontFamily="mono" color="gray.250">
                        {r.feesCollected !== null ? String(r.feesCollected) : '—'}
                      </Td>
                      <Td borderColor="gray.750" textAlign="right">
                        <Button
                          as={NextLink}
                          href={`/epoch/detail/?index=${r.index}`}
                          size="xs"
                          variant="outline"
                          colorScheme="blue"
                        >
                          View
                        </Button>
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
