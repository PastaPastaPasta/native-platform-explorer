'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Code,
  FormControl,
  FormLabel,
  HStack,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useContract } from '@sdk/queries';
import { parseSqlMulti, resolveContractId } from '@util/sql-parser';
import { quoteSqlIdentifier } from '@util/query-workspace';
import { documentTypeNames, normaliseContract } from '@util/contract';
import { getDocumentTypeSchema, getIndicesForType } from '@util/schema';

export function SchemaAssistant({
  contractId,
  sql,
  onChange,
}: {
  contractId: string;
  sql: string;
  onChange: (sql: string) => void;
}) {
  const parsed = useMemo(() => parseSqlMulti(sql), [sql]);
  const first = parsed.ok ? parsed.queries[0] : undefined;
  const schemaContractId = first ? resolveContractId(first, contractId).contractId : contractId;
  const contractQ = useContract(schemaContractId || undefined);
  const types = useMemo(
    () => (contractQ.data ? documentTypeNames(normaliseContract(contractQ.data)) : []),
    [contractQ.data],
  );
  const [chosenType, setChosenType] = useState('');
  const type = types.includes(chosenType)
    ? chosenType
    : first && types.includes(first.from)
      ? first.from
      : (types[0] ?? '');
  const schema = useMemo(() => getDocumentTypeSchema(contractQ.data, type), [contractQ.data, type]);
  const fields =
    schema?.properties && typeof schema.properties === 'object'
      ? Object.entries(schema.properties as Record<string, Record<string, unknown>>)
      : [];
  const indices = getIndicesForType(schema);
  const from = first?.contractAlias
    ? `${quoteSqlIdentifier(first.contractAlias)}.${quoteSqlIdentifier(type)}`
    : quoteSqlIdentifier(type);

  return (
    <VStack align="stretch" spacing={2}>
      <FormControl>
        <FormLabel htmlFor="query-schema-type" fontSize="xs" color="gray.400">
          Schema document type
        </FormLabel>
        <HStack flexWrap="wrap">
          <Select
            id="query-schema-type"
            size="sm"
            maxW="280px"
            value={type}
            isDisabled={!types.length}
            onChange={(event) => setChosenType(event.target.value)}
          >
            {!types.length && (
              <option value="">
                {contractQ.isLoading ? 'Loading schema…' : 'No schema available'}
              </option>
            )}
            {types.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Button
            size="xs"
            variant="outline"
            isDisabled={!type}
            onClick={() => onChange(`SELECT * FROM ${from} LIMIT 25`)}
          >
            Use document type
          </Button>
        </HStack>
      </FormControl>
      {contractQ.isError && (
        <Text fontSize="xs" color="orange.300">
          Schema unavailable. You can still enter a query and retry the network request.
        </Text>
      )}
      {!!fields.length && (
        <Text fontSize="xs" color="gray.400">
          Fields:{' '}
          {fields
            .map(
              ([name, property]) =>
                `${name} (${property.type ?? (property.byteArray ? 'bytes' : 'unknown')})`,
            )
            .join(' · ')}
        </Text>
      )}
      {!!type && (
        <Text fontSize="xs" color="gray.400">
          System fields: $id, $ownerId, $revision, $createdAt, $updatedAt.
        </Text>
      )}
      {indices.map((index) => (
        <HStack key={index.name} flexWrap="wrap" spacing={2}>
          <Text fontSize="xs" color="gray.400">
            Index {index.name}
            {index.unique ? ' (unique)' : ''}:
          </Text>
          <Code fontSize="xs">
            {index.properties.map((property) => `${property.field} ${property.order}`).join(', ')}
          </Code>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              onChange(
                `SELECT * FROM ${from} ORDER BY ${index.properties.map((property) => `${property.field.split('.').map(quoteSqlIdentifier).join('.')} ${property.order.toUpperCase()}`).join(', ')} LIMIT 25`,
              )
            }
          >
            Use index ordering
          </Button>
        </HStack>
      ))}
      {!!type && (
        <Text fontSize="2xs" color="gray.500">
          An index lists fields in query order. Supply equality filters for preceding fields before
          filtering or sorting a later field. Generated ordering is a starting point; the Platform
          validates the complete query.
        </Text>
      )}
    </VStack>
  );
}
