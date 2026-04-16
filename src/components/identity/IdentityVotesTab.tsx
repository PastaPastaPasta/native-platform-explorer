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

function normaliseChoice(raw: unknown): VoteChoice {
  // ResourceVote exposes `.choice.voteType` as 'TowardsIdentity' | 'Abstain' | 'Lock'.
  // Be tolerant of shape drift between SDK versions.
  const choice = readProp<unknown>(raw, 'choice');
  const voteType =
    readProp<string>(choice, 'voteType') ??
    readProp<string>(raw, 'voteType') ??
    readProp<string>(raw, 'type');
  const s = (typeof voteType === 'string' ? voteType : typeof raw === 'string' ? raw : '').toLowerCase();
  if (s.includes('toward')) return 'towardsIdentity';
  if (s.includes('abstain')) return 'abstain';
  if (s.includes('lock')) return 'lock';
  return 'unknown';
}

export function IdentityVotesTab({ identityId }: { identityId: string }) {
  const q = useIdentityVotes(identityId);
  const rows = (() => {
    if (!q.data) return [] as Array<{ resource: string; choice: VoteChoice }>;
    if (q.data instanceof Map) {
      return [...q.data.entries()].map(([resource, vote]) => ({
        resource: typeof resource === 'string' ? resource : String(resource),
        choice: normaliseChoice(vote),
      }));
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
