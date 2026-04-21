'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  FormControl,
  FormLabel,
  Input,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useContract } from '@/sdk/queries';
import { normaliseContract, documentTypeNames } from '@util/contract';
import { isBase58Identifier } from '@util/identifier';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

export function DocumentDeserializerTool() {
  const [contractId, setContractId] = useState('');
  const [docType, setDocType] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const validContractId = isBase58Identifier(contractId) ? contractId : undefined;
  const contractQ = useContract(validContractId);

  const docTypes = useMemo(() => {
    if (!contractQ.data) return [];
    return documentTypeNames(normaliseContract(contractQ.data));
  }, [contractQ.data]);

  const ready = !!contractQ.data && !!docType;

  const handleDecode = useCallback(
    async (bytes: Uint8Array | null) => {
      if (!bytes || !contractQ.data || !docType) {
        setResult(null);
        setError(null);
        return;
      }
      try {
        const wasm = await import('@dashevo/evo-sdk');
        await wasm.ensureInitialized();
        const doc = wasm.Document.fromBytes(
          bytes,
          contractQ.data as InstanceType<typeof wasm.DataContract>,
          docType,
          wasm.PlatformVersion.latest(),
        );
        setResult(doc);
        setError(null);
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [contractQ.data, docType],
  );

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={4}>
        <VStack align="flex-start" spacing={1}>
          <Text fontSize="md" fontWeight={600} color="gray.100">
            Document Deserializer
          </Text>
          <Text fontSize="sm" color="gray.400">
            Decode a document from its serialized bytes. Requires a data contract and
            document type for context.
          </Text>
        </VStack>

        <FormControl>
          <FormLabel fontSize="xs" color="gray.250">
            Contract ID
          </FormLabel>
          <Input
            size="sm"
            value={contractId}
            onChange={(e) => {
              setContractId(e.target.value);
              setDocType('');
              setResult(null);
              setError(null);
            }}
            placeholder="Enter base58 contract identifier"
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
          />
          {contractId && !validContractId ? (
            <Text fontSize="xs" color="yellow.300" mt={1}>
              Enter a valid base58 identifier (43–44 characters)
            </Text>
          ) : null}
          {contractQ.isLoading ? (
            <Text fontSize="xs" color="gray.400" mt={1}>
              Fetching contract…
            </Text>
          ) : null}
          {contractQ.error ? (
            <Text fontSize="xs" color="red.300" mt={1}>
              Failed to fetch contract: {contractQ.error.message}
            </Text>
          ) : null}
        </FormControl>

        {docTypes.length > 0 ? (
          <FormControl>
            <FormLabel fontSize="xs" color="gray.250">
              Document type
            </FormLabel>
            <Select
              size="sm"
              value={docType}
              onChange={(e) => {
                setDocType(e.target.value);
                setResult(null);
                setError(null);
              }}
              bg="gray.800"
              borderColor="gray.700"
              placeholder="Select document type"
            >
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormControl>
        ) : null}

        <DeserializerInput
          disabled={!ready}
          label={ready ? 'Document bytes' : 'Document bytes (select contract and type first)'}
          onDecode={handleDecode}
        />

        {error ? <DeserializerError message={error} /> : null}
        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
