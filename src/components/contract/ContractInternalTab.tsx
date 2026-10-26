'use client';

import { Badge, Box, HStack, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { InfoLine } from '@components/data/InfoLine';
import { RawJsonDisclosure } from '@components/data/RawJsonDisclosure';
import type { ContractShape } from '@util/contract';

// rs-dpp `DataContractConfigV1` fields, in the order Platform documents them.
const CONFIG_FLAGS: Array<[key: string, label: string]> = [
  ['canBeDeleted', 'Contract can be deleted'],
  ['readonly', 'Read-only (no updates)'],
  ['keepsHistory', 'Keeps every contract version'],
  ['documentsKeepHistoryContractDefault', 'Documents keep history (default)'],
  ['documentsMutableContractDefault', 'Documents are mutable (default)'],
  ['documentsCanBeDeletedContractDefault', 'Documents can be deleted (default)'],
  ['sizedIntegerTypes', 'Sized integer types'],
];

function KeyBound({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text as="span" color="gray.400">not required</Text>;
  return <Text as="span" fontFamily="mono" color="gray.100">{String(typeof value === 'object' ? JSON.stringify(value) : value)}</Text>;
}

export function ContractInternalTab({ contract }: { contract: ContractShape }) {
  const config = contract.config ?? {};
  const known = new Set([...CONFIG_FLAGS.map(([k]) => k), '$formatVersion', 'requiresIdentityEncryptionBoundedKey', 'requiresIdentityDecryptionBoundedKey']);
  const other = Object.entries(config).filter(([k]) => !known.has(k));
  return (
    <VStack align="stretch" spacing={4}>
      <HStack spacing={8} flexWrap="wrap" align="flex-start">
        <InfoLine label="Contract format" value={<Text fontFamily="mono">v{contract.formatVersion ?? '?'}</Text>} />
        <InfoLine label="Config format" value={<Text fontFamily="mono">v{String(config.$formatVersion ?? '?')}</Text>} />
        <InfoLine label="Contract version" value={<Text fontFamily="mono">{String(contract.version ?? '?')}</Text>} />
      </HStack>

      <InfoLine
        label="Description"
        value={contract.description
          ? <Text fontSize="sm" color="gray.250">{contract.description}</Text>
          : <Text fontSize="sm" color="gray.400">No description set.</Text>}
      />
      <InfoLine
        label="Keywords"
        value={contract.keywords?.length ? (
          <Wrap spacing={2}>
            {contract.keywords.map((k) => (
              <WrapItem key={k}><Badge variant="subtle" textTransform="none">{k}</Badge></WrapItem>
            ))}
          </Wrap>
        ) : <Text fontSize="sm" color="gray.400">No keywords set.</Text>}
      />

      <Box overflowX="auto">
        <Table size="sm" aria-label="Contract configuration">
          <Thead>
            <Tr>
              <Th color="gray.400" borderColor="gray.750">Config flag</Th>
              <Th color="gray.400" borderColor="gray.750">Value</Th>
            </Tr>
          </Thead>
          <Tbody>
            {CONFIG_FLAGS.filter(([k]) => k in config).map(([key, label]) => (
              <Tr key={key}>
                <Td borderColor="gray.750">
                  <Text color="gray.100" fontSize="sm">{label}</Text>
                  <Text color="gray.500" fontSize="2xs" fontFamily="mono">{key}</Text>
                </Td>
                <Td borderColor="gray.750">
                  <Badge colorScheme={config[key] === true ? 'green' : 'gray'} variant="subtle">
                    {config[key] === true ? 'yes' : config[key] === false ? 'no' : String(config[key])}
                  </Badge>
                </Td>
              </Tr>
            ))}
            <Tr>
              <Td borderColor="gray.750">
                <Text color="gray.100" fontSize="sm">Encryption key bound to contract</Text>
                <Text color="gray.500" fontSize="2xs" fontFamily="mono">requiresIdentityEncryptionBoundedKey</Text>
              </Td>
              <Td borderColor="gray.750"><KeyBound value={config.requiresIdentityEncryptionBoundedKey} /></Td>
            </Tr>
            <Tr>
              <Td borderColor="gray.750">
                <Text color="gray.100" fontSize="sm">Decryption key bound to contract</Text>
                <Text color="gray.500" fontSize="2xs" fontFamily="mono">requiresIdentityDecryptionBoundedKey</Text>
              </Td>
              <Td borderColor="gray.750"><KeyBound value={config.requiresIdentityDecryptionBoundedKey} /></Td>
            </Tr>
            {other.map(([key, value]) => (
              <Tr key={key}>
                <Td borderColor="gray.750"><Text color="gray.100" fontSize="sm" fontFamily="mono">{key}</Text></Td>
                <Td borderColor="gray.750"><Text fontFamily="mono" fontSize="xs">{JSON.stringify(value)}</Text></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <RawJsonDisclosure value={contract.plain ?? contract.raw} label="Full contract JSON" />
    </VStack>
  );
}
