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
        <Text fontSize="xs" color="gray.400" lineHeight="1.6">
          Paste the raw bytes of an identity to inspect its keys, balance, and revision.
        </Text>

        <DeserializerInput label="Identity bytes" onDecode={handleDecode} />

        {error ? <DeserializerError message={error} /> : null}
        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
