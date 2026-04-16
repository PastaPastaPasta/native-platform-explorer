'use client';

import {
  Box,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { VoteChoiceBadge, type VoteChoice } from '@components/governance/VoteChoiceBadge';
import { useIdentityVotes } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';

export function IdentityVotesTab({ identityId }: { identityId: string }) {
  const q = useIdentityVotes(identityId);
  const rows = (() => {
    if (!q.data) return [] as Array<{ resource: string; choice: VoteChoice | string }>;
    if (q.data instanceof Map) {
      return [...q.data.entries()].map(([resource, vote]) => {
        const choice =
          (readProp<string>(vote, 'voteChoice') as VoteChoice) ??
          (typeof vote === 'string' ? (vote as VoteChoice) : 'unknown');
        return { resource: typeof resource === 'string' ? resource : String(resource), choice };
      });
    }
    return [];
  })();

  if (q.isLoading) return <LoadingCard lines={3} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  if (rows.length === 0) {
    return (
      <InfoBlock>
        <Text color="gray.400" fontSize="sm">
          This identity has not cast any recorded votes.
        </Text>
      </InfoBlock>
    );
  }
  return (
    <InfoBlock>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th color="gray.400" borderColor="gray.750">Resource</Th>
              <Th color="gray.400" borderColor="gray.750">Choice</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r, i) => (
              <Tr key={`${r.resource}-${i}`} _hover={{ bg: 'gray.800' }}>
                <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" color="gray.250">
                  {r.resource}
                </Td>
                <Td borderColor="gray.750">
                  <VoteChoiceBadge choice={r.choice} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </InfoBlock>
  );
}
