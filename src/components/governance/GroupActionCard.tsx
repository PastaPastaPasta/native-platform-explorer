'use client';

import { Badge, Box, HStack, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { RawJsonDisclosure } from '@components/data/RawJsonDisclosure';
import { useGroupActionSigners } from '@sdk/queries';
import { toPlain } from '@util/contract';
import { idToString, readProp } from '@util/sdk-shape';
import { safeStringify } from '@util/wasm-json';

type Json = Record<string, unknown>;

/** `GroupAction.toJSON()`: `{ proposer_id, token_contract_position, event }`.
 *  The event is `{ type: "tokenEvent", data: { type: "mint", data: [...] } }`
 *  in rc.2 and `{ $kind: "tokenEvent", $type: "mint", amount, ... }`, with the
 *  token event's fields flattened, in 5.0. */
export function summarizeGroupAction(action: unknown) {
  const plain = (toPlain(action) ?? {}) as Json;
  const event = (plain.event ?? {}) as Json;
  const flat = typeof event.$kind === 'string';
  const inner = (flat ? event : event.data ?? {}) as Json;
  const { $kind: _kind, $type: _type, ...fields } = inner;
  return {
    proposerId: idToString(readProp<unknown>(action, 'proposerId')) ?? (typeof plain.proposer_id === 'string' ? plain.proposer_id : undefined),
    tokenPosition: plain.token_contract_position ?? readProp<number>(action, 'tokenContractPosition'),
    eventType: flat ? (event.$kind as string) : typeof event.type === 'string' ? event.type : undefined,
    kind: typeof inner.type === 'string' ? inner.type : typeof inner.$type === 'string' ? inner.$type : undefined,
    payload: flat ? fields : inner.data,
    plain,
  };
}

export function GroupActionCard({
  contractId,
  position,
  status,
  actionId,
  action,
  requiredPower,
}: {
  contractId: string;
  position: number;
  status: 'ACTIVE' | 'CLOSED';
  actionId: string;
  action: unknown;
  requiredPower?: number;
}) {
  const summary = summarizeGroupAction(action);
  const signersQ = useGroupActionSigners(contractId, position, status, actionId);
  const signers = signersQ.data instanceof Map
    ? [...signersQ.data.entries()].map(([id, power]) => ({ id: String(id), power: Number(power) })).sort((a, b) => b.power - a.power)
    : [];
  const signed = signers.reduce((sum, s) => sum + s.power, 0);

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <HStack spacing={3} flexWrap="wrap">
          <Badge colorScheme={status === 'ACTIVE' ? 'green' : 'gray'} variant="subtle">{status.toLowerCase()}</Badge>
          <Text fontWeight={600} color="gray.100">
            {summary.kind ?? summary.eventType ?? 'action'}
            {summary.tokenPosition !== undefined ? (
              <Text as="span" color="gray.400" fontWeight={400}> · token #{String(summary.tokenPosition)}</Text>
            ) : null}
          </Text>
          <Identifier value={actionId} dense copy />
        </HStack>
        {summary.proposerId ? (
          <HStack spacing={2} fontSize="xs" color="gray.250">
            <Text>Proposed by</Text>
            <IdentityLink id={summary.proposerId} dense />
          </HStack>
        ) : null}
        {summary.payload !== undefined ? (
          <Text fontFamily="mono" fontSize="xs" color="gray.250" wordBreak="break-all">
            {safeStringify(summary.payload, 0)}
          </Text>
        ) : null}
        <Box>
          <Text fontSize="xs" color="gray.400" mb={1}>
            Signers{signersQ.data instanceof Map ? ` — ${signed}${requiredPower !== undefined ? ` of ${requiredPower}` : ''} power` : ''}
          </Text>
          {signersQ.isLoading ? (
            <LoadingCard lines={1} />
          ) : signersQ.isError ? (
            <ErrorCard error={signersQ.error} onRetry={() => signersQ.refetch()} />
          ) : signers.length === 0 ? (
            <Text fontSize="xs" color="gray.400">No signers recorded.</Text>
          ) : (
            <Table size="sm" aria-label={`Signers of action ${actionId}`}>
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Member</Th>
                  <Th color="gray.400" borderColor="gray.750" isNumeric>Power</Th>
                </Tr>
              </Thead>
              <Tbody>
                {signers.map((s) => (
                  <Tr key={s.id}>
                    <Td borderColor="gray.750"><IdentityLink id={s.id} dense /></Td>
                    <Td borderColor="gray.750" isNumeric fontFamily="mono">{s.power}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
        <RawJsonDisclosure value={summary.plain} label="Raw action" />
      </VStack>
    </InfoBlock>
  );
}
