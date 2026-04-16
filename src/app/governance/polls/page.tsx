'use client';

import { useMemo, useState } from 'react';
import {
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useVotePollsByEndDate } from '@sdk/queries';

function dateToBucket(input: string): number | undefined {
  if (!input) return undefined;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : undefined;
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Governance' }, { label: 'Polls' }]);

  const defaultEnd = useMemo(() => {
    const d = new Date(Date.now() + 30 * 86_400_000);
    return d.toISOString().slice(0, 10);
  }, []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const [startInput, setStartInput] = useState(defaultStart);
  const [endInput, setEndInput] = useState(defaultEnd);

  const startMs = dateToBucket(startInput);
  const endMs = dateToBucket(endInput);
  // Bucket to hour so rapid edits don't thrash the cache.
  const startBucket = startMs !== undefined ? Math.floor(startMs / 3_600_000) * 3_600_000 : undefined;
  const endBucket = endMs !== undefined ? Math.floor(endMs / 3_600_000) * 3_600_000 : undefined;

  const q = useVotePollsByEndDate(startBucket, endBucket);
  const polls = (q.data as unknown[] | undefined) ?? [];

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              Vote polls
            </Heading>
            <HStack spacing={2}>
              <Input
                type="date"
                size="sm"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                bg="gray.800"
                borderColor="gray.700"
              />
              <Input
                type="date"
                size="sm"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                bg="gray.800"
                borderColor="gray.700"
              />
            </HStack>
            <Text fontSize="xs" color="gray.400">
              Polls ending between the selected dates.
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {q.isLoading ? (
            <LoadingCard lines={4} />
          ) : q.isError ? (
            <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <VotePollsList entries={polls} />
          )}
        </InfoBlock>
      </VStack>
    </Container>
  );
}
