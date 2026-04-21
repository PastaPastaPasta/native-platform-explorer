'use client';

import { useCallback, useState } from 'react';
import { HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { normaliseContract, documentTypeNames, tokenPositions } from '@util/contract';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

export function ContractDeserializerTool() {
  const [result, setResult] = useState<unknown>(null);
  const [meta, setMeta] = useState<{ id?: string; ownerId?: string; version?: string; docTypes: string[]; tokens: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDecode = useCallback(async (bytes: Uint8Array | null) => {
    if (!bytes) {
      setResult(null);
      setMeta(null);
      setError(null);
      return;
    }
    try {
      const wasm = await import('@dashevo/evo-sdk');
      await wasm.ensureInitialized();
      const contract = wasm.DataContract.fromBytes(bytes, false, wasm.PlatformVersion.latest());
      const shape = normaliseContract(contract);
      setMeta({
        id: shape.id,
        ownerId: shape.ownerId,
        version: shape.version != null ? String(shape.version) : undefined,
        docTypes: documentTypeNames(shape),
        tokens: tokenPositions(shape),
      });
      setResult(contract);
      setError(null);
    } catch (e) {
      setResult(null);
      setMeta(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={4}>
        <VStack align="flex-start" spacing={1}>
          <Text fontSize="md" fontWeight={600} color="gray.100">
            Contract Deserializer
          </Text>
          <Text fontSize="sm" color="gray.400">
            Decode a data contract from its serialized bytes.
          </Text>
        </VStack>

        <DeserializerInput onDecode={handleDecode} />

        {error ? <DeserializerError message={error} /> : null}

        {meta ? (
          <VStack align="stretch" spacing={1}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase">
              Metadata
            </Text>
            <HStack spacing={4} flexWrap="wrap">
              {meta.id ? (
                <Text fontSize="xs" color="gray.300">
                  <Text as="span" color="gray.500">ID:</Text> {meta.id}
                </Text>
              ) : null}
              {meta.ownerId ? (
                <Text fontSize="xs" color="gray.300">
                  <Text as="span" color="gray.500">Owner:</Text> {meta.ownerId}
                </Text>
              ) : null}
              {meta.version ? (
                <Text fontSize="xs" color="gray.300">
                  <Text as="span" color="gray.500">Version:</Text> {meta.version}
                </Text>
              ) : null}
              <Text fontSize="xs" color="gray.300">
                <Text as="span" color="gray.500">Document types:</Text> {meta.docTypes.length > 0 ? meta.docTypes.join(', ') : 'none'}
              </Text>
              {meta.tokens.length > 0 ? (
                <Text fontSize="xs" color="gray.300">
                  <Text as="span" color="gray.500">Tokens:</Text> {meta.tokens.join(', ')}
                </Text>
              ) : null}
            </HStack>
          </VStack>
        ) : null}

        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
