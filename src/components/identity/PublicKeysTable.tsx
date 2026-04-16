'use client';

import { Badge, Box, Table, Tbody, Td, Th, Thead, Tr, Text } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';

interface Key {
  id?: number;
  keyId?: number;
  purpose?: string | number;
  type?: string | number;
  securityLevel?: string | number;
  data?: string | Uint8Array;
  disabled?: boolean;
  disabledAt?: number | bigint | null;
  readOnly?: boolean;
}

function u8ToHex(u8: Uint8Array): string {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function PublicKeysTable({ keys }: { keys: Key[] | null | undefined }) {
  if (!keys || keys.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        No public keys on this identity.
      </Text>
    );
  }
  return (
    <Box overflowX="auto">
      <Table size="sm" variant="simple" fontSize="xs">
        <Thead>
          <Tr>
            <Th color="gray.400" borderColor="gray.750">ID</Th>
            <Th color="gray.400" borderColor="gray.750">Purpose</Th>
            <Th color="gray.400" borderColor="gray.750">Type</Th>
            <Th color="gray.400" borderColor="gray.750">Security</Th>
            <Th color="gray.400" borderColor="gray.750">Data</Th>
            <Th color="gray.400" borderColor="gray.750">State</Th>
          </Tr>
        </Thead>
        <Tbody>
          {keys.map((k, i) => {
            const id = k.id ?? k.keyId ?? i;
            const data =
              k.data instanceof Uint8Array
                ? u8ToHex(k.data)
                : typeof k.data === 'string'
                  ? k.data
                  : JSON.stringify(k.data);
            return (
              <Tr key={id} _hover={{ bg: 'gray.800' }}>
                <Td borderColor="gray.750" fontFamily="mono">
                  {id}
                </Td>
                <Td borderColor="gray.750">{String(k.purpose ?? '—')}</Td>
                <Td borderColor="gray.750">{String(k.type ?? '—')}</Td>
                <Td borderColor="gray.750">{String(k.securityLevel ?? '—')}</Td>
                <Td borderColor="gray.750" maxW="320px">
                  <CodeBlock value={data} collapsedHeight={60} />
                </Td>
                <Td borderColor="gray.750">
                  {k.disabled ? (
                    <Badge colorScheme="red" variant="subtle">
                      disabled
                    </Badge>
                  ) : (
                    <Badge colorScheme="green" variant="subtle">
                      active
                    </Badge>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
