'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
  HStack,
  Input,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useSdkQuery } from '@sdk/hooks';
import { normaliseContract, toPlain } from '@util/contract';
import { ContractPicker, rememberContract } from '../ContractPicker';
import {
  SchemaForm,
  validateAgainstSchema,
  issuesToErrorMap,
  type SchemaObject,
} from './SchemaForm';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentReplaceOptions {
  contractId: string;
  documentType: string;
  documentId: string;
  currentRevision: bigint;
  properties: Record<string, unknown>;
}

function stripSystemFields(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('$')) continue;
    out[k] = v;
  }
  return out;
}

export function DocumentReplaceForm({
  onOptionsChange,
}: OperationFormProps<DocumentReplaceOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentType, setDocumentType] = useState(params.get('type') ?? '');
  const [documentId, setDocumentId] = useState(params.get('id') ?? '');
  const [properties, setProperties] = useState<SchemaObject>({});
  // The editable properties and revision always come from one fetched document.
  // Changing the contract, type, or ID invalidates them until that target loads.
  const [loaded, setLoaded] = useState<{ target: string; revision: bigint } | null>(null);

  const validContract = isBase58Identifier(contractId.trim());
  const validDocId = isBase58Identifier(documentId.trim());

  const contractQuery = useSdkQuery(
    ['contract', contractId.trim()],
    async (sdk) => {
      if (!validContract) return null;
      const c = await sdk.contracts.fetch(contractId.trim());
      if (c) rememberContract(contractId.trim());
      return c ?? null;
    },
    { enabled: validContract },
  );

  const documentSchemas = useMemo(() => {
    if (!contractQuery.data) return {};
    return (normaliseContract(contractQuery.data).documentSchemas ?? {}) as Record<
      string,
      SchemaObject
    >;
  }, [contractQuery.data]);
  const docTypeNames = useMemo(() => Object.keys(documentSchemas), [documentSchemas]);

  useEffect(() => {
    const fallback = docTypeNames[0];
    if (fallback && !docTypeNames.includes(documentType)) setDocumentType(fallback);
  }, [docTypeNames, documentType]);

  const docQuery = useSdkQuery(
    ['document', contractId.trim(), documentType, documentId.trim()],
    async (sdk) => {
      if (!validContract || !validDocId || !documentType) return null;
      return sdk.documents.get(contractId.trim(), documentType, documentId.trim()) ?? null;
    },
    { enabled: validContract && validDocId && !!documentType },
  );

  const target = `${contractId.trim()}/${documentType}/${documentId.trim()}`;
  const populate = useCallback(
    (doc: unknown) => {
      if (!doc) return;
      // Ignore a response for a different document (e.g. a late refetch).
      const id = (doc as { id?: unknown }).id;
      if (id !== undefined && String(id) !== documentId.trim()) return;
      const rev = (doc as { revision?: bigint | number | null }).revision;
      const plain = toPlain(doc) as Record<string, unknown>;
      // Document.toObject() and toJSON() include $-prefixed metadata; the
      // properties bag for our form is everything else.
      const props =
        plain && typeof plain === 'object'
          ? stripSystemFields(
              plain.properties && typeof plain.properties === 'object'
                ? (plain.properties as Record<string, unknown>)
                : plain,
            )
          : {};
      setProperties(props);
      setLoaded({ target, revision: rev != null ? BigInt(rev) : 1n });
    },
    [documentId, target],
  );
  const isLoaded = loaded?.target === target;

  useEffect(() => {
    if (docQuery.data && !isLoaded) populate(docQuery.data);
  }, [docQuery.data, isLoaded, populate]);

  const activeSchema = documentSchemas[documentType];
  const errors = useMemo(() => {
    if (!activeSchema) return {};
    return issuesToErrorMap(validateAgainstSchema(activeSchema, properties));
  }, [activeSchema, properties]);

  useEffect(() => {
    if (
      !validContract ||
      !validDocId ||
      !documentType ||
      !activeSchema ||
      !loaded ||
      !isLoaded ||
      Object.keys(errors).length > 0
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      documentType,
      documentId: documentId.trim(),
      currentRevision: loaded.revision,
      properties,
    });
  }, [
    validContract,
    validDocId,
    documentType,
    activeSchema,
    loaded,
    isLoaded,
    properties,
    contractId,
    documentId,
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

      <Box>
        <HStack justify="space-between" mb={1}>
          <Text fontSize="sm" color="gray.100" fontWeight={500}>
            Document ID
          </Text>
          {loaded && isLoaded ? (
            <Text fontSize="xs" color="gray.400">
              Revision: {String(loaded.revision)} → {String(loaded.revision + 1n)}
            </Text>
          ) : null}
        </HStack>
        <HStack>
          <Input
            size="sm"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Base58 document ID"
            fontFamily="mono"
            bg="gray.800"
            borderColor={documentId && !validDocId ? 'danger' : 'gray.700'}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoaded(null);
              void docQuery.refetch().then((result) => populate(result.data));
            }}
            isDisabled={!validDocId || !documentType}
          >
            Reload
          </Button>
        </HStack>
      </Box>

      {activeSchema && isLoaded ? (
        <SchemaForm
          schema={activeSchema}
          value={properties}
          onChange={setProperties}
          errors={errors}
        />
      ) : docQuery.isLoading ? (
        <Text fontSize="xs" color="gray.400">
          Loading document…
        </Text>
      ) : null}
    </VStack>
  );
}
