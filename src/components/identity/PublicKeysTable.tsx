'use client';

import { Badge, Box, HStack, Table, Tbody, Td, Th, Thead, Tr, Text } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';

// Fields match the SDK's IdentityPublicKey class (see wasm_sdk.d.ts):
//   keyId, purpose, keyType, securityLevel, data, disabledAt, isReadOnly.
// Accept the historic short names (type, id, disabled, readOnly) as fallbacks
// for any callers that pre-normalise.
interface Key {
  id?: number;
  keyId?: number;
  purpose?: string | number;
  type?: string | number;
  keyType?: string | number;
  securityLevel?: string | number;
  data?: string | Uint8Array;
  disabled?: boolean;
  disabledAt?: number | bigint | null;
  readOnly?: boolean;
  isReadOnly?: boolean;
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
            const id = k.keyId ?? k.id ?? i;
            const keyType = k.keyType ?? k.type;
            const disabledAt = k.disabledAt ?? null;
            const isDisabled = Boolean(k.disabled) || disabledAt !== null;
            const isReadOnly = Boolean(k.isReadOnly ?? k.readOnly);
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
                <Td borderColor="gray.750">{keyType !== undefined ? String(keyType) : '—'}</Td>
                <Td borderColor="gray.750">{String(k.securityLevel ?? '—')}</Td>
                <Td borderColor="gray.750" maxW="320px">
                  <CodeBlock value={data} collapsedHeight={60} />
                </Td>
                <Td borderColor="gray.750">
                  <HStack spacing={1} flexWrap="wrap">
                    {isDisabled ? (
                      <Badge colorScheme="red" variant="subtle">
                        disabled
                      </Badge>
                    ) : (
                      <Badge colorScheme="green" variant="subtle">
                        active
                      </Badge>
                    )}
                    {isReadOnly ? (
                      <Badge colorScheme="gray" variant="subtle">
                        read-only
                      </Badge>
                    ) : null}
                  </HStack>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
