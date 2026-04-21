'use client';

import { useCallback, useState } from 'react';
import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { normaliseContract, documentTypeNames, tokenPositions } from '@util/contract';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

interface ContractMeta {
  id?: string;
  ownerId?: string;
  version?: string;
  docTypes: string[];
  tokens: string[];
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <Box
      px={3}
      py={1.5}
      borderRadius="lg"
      bg="rgba(46,57,61,0.4)"
      border="1px solid"
      borderColor="rgba(255,255,255,0.06)"
    >
      <Text fontSize="2xs" color="gray.500" fontWeight={500} textTransform="uppercase" letterSpacing="0.05em">
        {label}
      </Text>
      <Text fontSize="xs" color="gray.200" fontFamily="mono" mt={0.5} wordBreak="break-all">
        {value}
      </Text>
    </Box>
  );
}

export function ContractDeserializerTool() {
  const [result, setResult] = useState<unknown>(null);
  const [meta, setMeta] = useState<ContractMeta | null>(null);
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
        <Text fontSize="xs" color="gray.400" lineHeight="1.6">
          Paste the raw bytes of a data contract to inspect its document schemas, tokens, and groups.
        </Text>

        <DeserializerInput label="Contract bytes" onDecode={handleDecode} />

        {error ? <DeserializerError message={error} /> : null}

        {meta ? (
          <HStack spacing={2} flexWrap="wrap">
            {meta.id ? <MetaChip label="ID" value={meta.id} /> : null}
            {meta.ownerId ? <MetaChip label="Owner" value={meta.ownerId} /> : null}
            {meta.version ? <MetaChip label="Version" value={meta.version} /> : null}
            <MetaChip
              label="Document types"
              value={meta.docTypes.length > 0 ? meta.docTypes.join(', ') : 'none'}
            />
            {meta.tokens.length > 0 ? (
              <MetaChip label="Tokens" value={meta.tokens.join(', ')} />
            ) : null}
          </HStack>
        ) : null}

        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
