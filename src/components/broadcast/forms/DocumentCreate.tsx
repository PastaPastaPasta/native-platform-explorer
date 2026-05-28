'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  HStack,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useSdkQuery } from '@sdk/hooks';
import { normaliseContract } from '@util/contract';
import { ContractPicker, rememberContract } from '../ContractPicker';
import {
  SchemaForm,
  emptyValueFor,
  validateAgainstSchema,
  issuesToErrorMap,
  type SchemaObject,
} from './SchemaForm';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentCreateOptions {
  contractId: string;
  documentType: string;
  properties: Record<string, unknown>;
}

export function DocumentCreateForm({
  onOptionsChange,
}: OperationFormProps<DocumentCreateOptions>) {
  const params = useSearchParams();
  const initialContract = params.get('contract') ?? '';
  const initialType = params.get('type') ?? '';

  const [contractId, setContractId] = useState(initialContract);
  const [documentType, setDocumentType] = useState(initialType);
  const [properties, setProperties] = useState<SchemaObject>({});

  const validContractId = isBase58Identifier(contractId.trim());

  const contractQuery = useSdkQuery(
    ['contract', contractId.trim()],
    async (sdk) => {
      if (!validContractId) return null;
      const c = await sdk.contracts.fetch(contractId.trim());
      if (c) rememberContract(contractId.trim());
      return c ?? null;
    },
    { enabled: validContractId },
  );

  const documentSchemas = useMemo(() => {
    if (!contractQuery.data) return {};
    const norm = normaliseContract(contractQuery.data);
    return (norm.documentSchemas ?? {}) as Record<string, SchemaObject>;
  }, [contractQuery.data]);

  const docTypeNames = useMemo(() => Object.keys(documentSchemas), [documentSchemas]);

  // Pick a sensible default document type once schemas resolve.
  useEffect(() => {
    if (!documentType && docTypeNames.length > 0) {
      const fallback = docTypeNames[0];
      if (!fallback) return;
      setDocumentType(
        initialType && docTypeNames.includes(initialType) ? initialType : fallback,
      );
    }
  }, [docTypeNames, documentType, initialType]);

  // Reset properties when the document type changes.
  const activeSchema: SchemaObject | undefined = documentSchemas[documentType];
  useEffect(() => {
    if (activeSchema) setProperties(emptyValueFor(activeSchema));
    else setProperties({});
  }, [documentType, activeSchema]);

  const errors = useMemo(() => {
    if (!activeSchema) return {};
    return issuesToErrorMap(validateAgainstSchema(activeSchema, properties));
  }, [activeSchema, properties]);

  // Bubble options up when valid.
  useEffect(() => {
    if (!validContractId || !documentType || !activeSchema) {
      onOptionsChange(null);
      return;
    }
    if (Object.keys(errors).length > 0) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      documentType,
      properties,
    });
  }, [
    validContractId,
    documentType,
    activeSchema,
    properties,
    contractId,
    errors,
    onOptionsChange,
  ]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract
        </Text>
        <ContractPicker value={contractId} onChange={setContractId} />
        {contractQuery.isLoading ? (
          <Text fontSize="xs" color="gray.400" mt={1}>
            Loading contract…
          </Text>
        ) : null}
        {contractQuery.isError ? (
          <Text fontSize="xs" color="danger" mt={1}>
            {contractQuery.error?.message ?? 'Failed to load contract.'}
          </Text>
        ) : null}
        {validContractId && contractQuery.data === null ? (
          <Text fontSize="xs" color="danger" mt={1}>
            Contract not found on the current network.
          </Text>
        ) : null}
      </Box>

      {docTypeNames.length > 0 ? (
        <Box>
          <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
            Document type
          </Text>
          <Select
            size="sm"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            bg="gray.800"
            borderColor="gray.700"
          >
            {docTypeNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Box>
      ) : null}

      {activeSchema ? (
        <Box>
          <HStack mb={2} justify="space-between">
            <Text fontSize="sm" color="gray.100" fontWeight={500}>
              {documentType}
            </Text>
          </HStack>
          <SchemaForm
            schema={activeSchema}
            value={properties}
            onChange={setProperties}
            errors={errors}
          />
        </Box>
      ) : null}
    </VStack>
  );
}
