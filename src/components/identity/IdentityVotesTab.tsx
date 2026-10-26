'use client';

import NextLink from 'next/link';
import {
  Box,
  Link,
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
import { IdentityLink } from '@components/data/IdentityLink';
import { VoteChoiceBadge, type VoteChoice } from '@components/governance/VoteChoiceBadge';
import { useIdentityVotes } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { toPlain } from '@util/contract';
import { withNetwork } from '@util/exploration';
import { idToString, readProp } from '@util/sdk-shape';
import { safeStringify } from '@util/wasm-json';

export interface IdentityVoteRow {
  voteId: string;
  choice: VoteChoice;
  towardsIdentity?: string;
  contractId?: string;
  documentTypeName?: string;
  indexName?: string;
  indexValues?: unknown[];
}

function normaliseChoice(raw: unknown): { choice: VoteChoice; towards?: string } {
  // rc.2 ResourceVote: `.choice.voteType` is 'TowardsIdentity' | 'Abstain' | 'Lock'
  // and `.choice.value` the identity; toJSON() has `resourceVoteChoice.type`.
  const choice = readProp<unknown>(raw, 'choice') ?? readProp<unknown>(raw, 'resourceVoteChoice');
  const voteType =
    readProp<string>(choice, 'voteType') ??
    readProp<string>(choice, 'type') ??
    readProp<string>(raw, 'voteType') ??
    (typeof choice === 'string' ? choice : undefined);
  const s = (typeof voteType === 'string' ? voteType : '').toLowerCase();
  const towards = idToString(readProp<unknown>(choice, 'value') ?? readProp<unknown>(choice, 'data'));
  if (s.includes('toward')) return { choice: 'towardsIdentity', towards };
  if (s.includes('abstain')) return { choice: 'abstain' };
  if (s.includes('lock')) return { choice: 'lock' };
  return { choice: 'unknown' };
}

function voteRow(voteId: string, raw: unknown): IdentityVoteRow {
  // Prefer ResourceVote.toJSON(): its `votePoll.data.indexValues` are decoded
  // values, while the `poll.indexValues` getter yields serialized Value bytes.
  const json = toPlain(raw);
  const vote = json && typeof json === 'object' && 'votePoll' in json ? json : raw;
  const { choice, towards } = normaliseChoice(vote);
  const poll = readProp<unknown>(readProp<unknown>(vote, 'votePoll'), 'data') ?? readProp<unknown>(vote, 'poll');
  const indexValues = toPlain(readProp<unknown>(poll, 'indexValues'));
  return {
    voteId,
    choice,
    towardsIdentity: towards,
    contractId: idToString(readProp<unknown>(poll, 'contractId')),
    documentTypeName: readProp<string>(poll, 'documentTypeName'),
    indexName: readProp<string>(poll, 'indexName'),
    indexValues: Array.isArray(indexValues) && indexValues.every((v) => !(v instanceof Uint8Array)) ? indexValues : undefined,
  };
}

/** `voting.contestedResourceIdentityVotes` → rows. The SDK returns a Map keyed
 *  by vote ID; arrays and plain records are accepted too. */
export function identityVoteRows(data: unknown): IdentityVoteRow[] {
  if (!data || typeof data !== 'object') return [];
  const entries: Array<[unknown, unknown]> =
    data instanceof Map
      ? [...data.entries()]
      : Array.isArray(data)
        ? data.map((v, i) => [readProp<unknown>(v, 'id') ?? i, v])
        : Object.entries(data as Record<string, unknown>);
  return entries
    .filter(([, vote]) => vote !== undefined && vote !== null)
    .map(([key, vote]) => voteRow(idToString(key) ?? String(key), vote));
}

export function contestedDetailHref(row: IdentityVoteRow): string | null {
  if (!row.contractId || !row.documentTypeName || !row.indexName || !row.indexValues) return null;
  const qp = new URLSearchParams({
    contract: row.contractId,
    docType: row.documentTypeName,
    indexName: row.indexName,
    indexValues: safeStringify(row.indexValues, 0),
  });
  return `/governance/contested/detail/?${qp.toString()}`;
}

export function IdentityVotesTab({ identityId }: { identityId: string }) {
  const { network } = useSdk();
  const q = useIdentityVotes(identityId);
  const rows = identityVoteRows(q.data);

  if (q.isLoading) return <LoadingCard lines={3} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  if (rows.length === 0) {
    return (
      <InfoBlock>
        <Text color="gray.400" fontSize="sm">
          This identity has no recorded votes. Only masternode voting identities vote, and
          Platform deletes votes once a contest is decided.
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
            {rows.map((r) => {
              const href = contestedDetailHref(r);
              const label = r.indexValues
                ? `${r.documentTypeName ?? '?'} · ${r.indexValues.map((v) => String(v)).join(' / ')}`
                : r.voteId;
              return (
                <Tr key={r.voteId} _hover={{ bg: 'gray.800' }}>
                  <Td borderColor="gray.750" fontFamily="mono" fontSize="xs" color="gray.250">
                    {href ? (
                      <Link as={NextLink} href={withNetwork(href, network)} color="brand.light">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </Td>
                  <Td borderColor="gray.750">
                    <VoteChoiceBadge choice={r.choice} />{' '}
                    {r.towardsIdentity ? <IdentityLink id={r.towardsIdentity} dense /> : null}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </InfoBlock>
  );
}
