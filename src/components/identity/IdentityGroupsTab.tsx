'use client';

import NextLink from 'next/link';
import {
  Box,
  Button,
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
import { Identifier } from '@components/data/Identifier';
import { useIdentityGroups } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';

interface Row {
  contractId: string;
  position: number;
  power?: number | bigint;
}

function normaliseGroups(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  const out: Row[] = [];
  for (const entry of data) {
    const contractId = String(
      readProp<string>(entry, 'contractId') ?? readProp<string>(entry, 'dataContractId') ?? '',
    );
    const position = Number(
      readProp<number | bigint>(entry, 'groupContractPosition') ??
        readProp<number | bigint>(entry, 'position') ??
        NaN,
    );
    if (!contractId || !Number.isFinite(position)) continue;
    const power = readProp<number | bigint>(entry, 'power');
    out.push({ contractId, position, power });
  }
  return out;
}

export function IdentityGroupsTab({ identityId }: { identityId: string }) {
  const q = useIdentityGroups(identityId);
  const rows = normaliseGroups(q.data);
  if (q.isLoading) return <LoadingCard lines={3} />;
  if (q.isError) return <ErrorCard error={q.error} onRetry={() => q.refetch()} />;
  if (rows.length === 0) {
    return (
      <InfoBlock>
        <Text color="gray.400" fontSize="sm">
          This identity is not a member of any group.
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
              <Th color="gray.400" borderColor="gray.750">Contract</Th>
              <Th color="gray.400" borderColor="gray.750">Position</Th>
              <Th color="gray.400" borderColor="gray.750" isNumeric>Power</Th>
              <Th borderColor="gray.750" />
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r, i) => (
              <Tr key={`${r.contractId}-${r.position}-${i}`} _hover={{ bg: 'gray.800' }}>
                <Td borderColor="gray.750">
                  <Identifier value={r.contractId} href={`/contract/${r.contractId}/`} dense />
                </Td>
                <Td borderColor="gray.750" fontFamily="mono">#{r.position}</Td>
                <Td borderColor="gray.750" isNumeric fontFamily="mono">
                  {r.power !== undefined ? String(r.power) : '—'}
                </Td>
                <Td borderColor="gray.750" textAlign="right">
                  <Button
                    as={NextLink}
                    href={`/groups/${r.contractId}/${r.position}/`}
                    size="xs"
                    variant="outline"
                    colorScheme="blue"
                  >
                    Open
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </InfoBlock>
  );
}
