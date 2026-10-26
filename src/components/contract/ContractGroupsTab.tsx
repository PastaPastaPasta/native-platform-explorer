'use client';

import NextLink from 'next/link';
import { Box, Button, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import { IdentityLink } from '@components/data/IdentityLink';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { useGroupsDataContracts } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';
import { withNetwork } from '@util/exploration';

export interface GroupRow {
  position: number;
  members: Array<{ id: string; power: number }>;
  requiredPower: number | undefined;
}

function entriesOf(value: unknown): Array<[string, unknown]> {
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [String(k), v]);
  const plain = toPlain(value);
  return plain && typeof plain === 'object' ? Object.entries(plain as Record<string, unknown>) : [];
}

/** `group.groupsDataContracts([id])` → Map<contractId, Map<position, Group>>. */
export function groupRows(data: unknown, contractId: string, fallback?: Record<string, unknown>): GroupRow[] {
  const forContract = data instanceof Map ? data.get(contractId) : undefined;
  const source = forContract ?? fallback;
  return entriesOf(source)
    .map(([position, group]) => {
      const members = entriesOf(readProp<unknown>(group, 'members'))
        .map(([id, power]) => ({ id, power: Number(power) }))
        .sort((a, b) => b.power - a.power);
      const required = readProp<number | bigint>(group, 'requiredPower');
      return { position: Number(position), members, requiredPower: required === undefined ? undefined : Number(required) };
    })
    .filter((g) => Number.isFinite(g.position))
    .sort((a, b) => a.position - b.position);
}

export function ContractGroupsTab({ contractId, declared }: { contractId: string; declared?: Record<string, unknown> }) {
  const { network } = useSdk();
  const q = useGroupsDataContracts([contractId]);
  if (q.isLoading) return <LoadingCard lines={2} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  const rows = groupRows(q.data, contractId, declared);
  if (rows.length === 0) {
    return <Text color="gray.400" fontSize="sm">This contract does not define any groups.</Text>;
  }
  return (
    <Box overflowX="auto">
      <Table size="sm" aria-label="Contract groups">
        <Thead>
          <Tr>
            <Th color="gray.400" borderColor="gray.750">Position</Th>
            <Th color="gray.400" borderColor="gray.750">Members (power)</Th>
            <Th color="gray.400" borderColor="gray.750" isNumeric>Required power</Th>
            <Th color="gray.400" borderColor="gray.750"></Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((g) => {
            const total = g.members.reduce((sum, m) => sum + m.power, 0);
            return (
              <Tr key={g.position}>
                <Td borderColor="gray.750" fontFamily="mono" color="gray.100">#{g.position}</Td>
                <Td borderColor="gray.750">
                  <VStack align="flex-start" spacing={1}>
                    {g.members.map((m) => (
                      <Text as="span" key={m.id} fontSize="xs">
                        <IdentityLink id={m.id} dense />{' '}
                        <Text as="span" fontFamily="mono" color="gray.400">({m.power})</Text>
                      </Text>
                    ))}
                  </VStack>
                </Td>
                <Td borderColor="gray.750" isNumeric fontFamily="mono">
                  {g.requiredPower ?? '—'}
                  <Text fontSize="2xs" color="gray.500">of {total} total</Text>
                </Td>
                <Td borderColor="gray.750">
                  <Button
                    as={NextLink}
                    href={withNetwork(`/groups/detail/?contractId=${encodeURIComponent(contractId)}&position=${g.position}`, network)}
                    size="xs"
                    variant="outline"
                    colorScheme="blue"
                  >
                    Actions
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
