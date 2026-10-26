'use client';

import { useState } from 'react';
import { Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { useContestedResourceVoters } from '@sdk/queries';
import { idToString } from '@util/sdk-shape';

const PAGE = 50;

/** Masternode voter identities that voted for one contender, paged by voter ID. */
export function ContenderVoters({
  contractId,
  docType,
  indexName,
  indexValues,
  contestantId,
  isFinished,
}: {
  contractId: string;
  docType: string;
  indexName: string;
  indexValues: unknown[];
  contestantId: string;
  isFinished: boolean;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const q = useContestedResourceVoters(contractId, docType, indexName, indexValues, contestantId, cursors.at(-1), PAGE);
  const voters = Array.isArray(q.data)
    ? (q.data as unknown[]).map((v) => idToString(v)).filter((v): v is string => !!v)
    : [];

  if (q.isLoading) return <LoadingCard lines={2} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  if (voters.length === 0 && cursors.length === 0) {
    return (
      <Text fontSize="xs" color="gray.400">
        {isFinished
          ? 'No voters returned. Platform deletes individual votes once a contest is decided; only the final tally remains.'
          : 'No votes for this contender yet.'}
      </Text>
    );
  }
  return (
    <VStack align="stretch" spacing={2}>
      <Wrap spacing={2}>
        {voters.map((id) => (
          <WrapItem key={id}><IdentityLink id={id} dense showAlias={false} /></WrapItem>
        ))}
      </Wrap>
      <CursorPagination
        pageIndex={cursors.length}
        hasPrev={cursors.length > 0}
        hasNext={voters.length === PAGE}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
        onNext={() => setCursors((c) => [...c, voters[voters.length - 1]!])}
      />
    </VStack>
  );
}
