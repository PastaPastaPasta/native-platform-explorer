'use client';

import { useCallback, useState } from 'react';
import { Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

export function IdentityDeserializerTool() {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDecode = useCallback(async (bytes: Uint8Array | null) => {
    if (!bytes) {
      setResult(null);
      setError(null);
      return;
    }
    try {
      const wasm = await import('@dashevo/evo-sdk');
      await wasm.ensureInitialized();
      const identity = wasm.Identity.fromBytes(bytes);
      setResult(identity);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={4}>
        <VStack align="flex-start" spacing={1}>
          <Text fontSize="md" fontWeight={600} color="gray.100">
            Identity Deserializer
          </Text>
          <Text fontSize="sm" color="gray.400">
            Decode an identity from its serialized bytes.
          </Text>
        </VStack>

        <DeserializerInput onDecode={handleDecode} />

        {error ? <DeserializerError message={error} /> : null}
        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
