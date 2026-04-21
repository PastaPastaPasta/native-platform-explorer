'use client';

import { useCallback, useState } from 'react';
import { Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

export function ProofDeserializerTool() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDecode = useCallback(async (bytes: Uint8Array | null) => {
    if (!bytes) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const { parseGrovedbProof } = await import('@/lib/grovedb-proof-parser');
      const text = await parseGrovedbProof(bytes);
      setResult(text);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={4}>
        <Text fontSize="xs" color="gray.400" lineHeight="1.6">
          Paste the raw bytes of a GroveDB proof to inspect its merkle tree structure.
          Uses bincode deserialization matching Dash Platform&apos;s encoding.
        </Text>

        <DeserializerInput label="Proof bytes" onDecode={handleDecode} />

        {loading ? (
          <Text fontSize="xs" color="gray.500">Loading WASM module…</Text>
        ) : null}

        {error ? <DeserializerError message={error} /> : null}
        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
