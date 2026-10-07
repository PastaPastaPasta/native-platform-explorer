'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Text, Textarea, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';

export interface IdentityUpdateKeysOptions {
  addPublicKeysJson?: Record<string, unknown>[];
  disableKeyIds?: number[];
}

export function IdentityUpdateKeysForm({
  onOptionsChange,
}: OperationFormProps<IdentityUpdateKeysOptions>) {
  const [addText, setAddText] = useState('[]');
  const [disableText, setDisableText] = useState('');

  const { parsed, error } = useMemo(() => {
    let addPublicKeysJson: Record<string, unknown>[] | undefined;
    let disableKeyIds: number[] | undefined;
    try {
      const addJson: unknown = JSON.parse(addText);
      if (!Array.isArray(addJson)) {
        return { parsed: null, error: 'Add-keys must be a JSON array.' };
      }
      addPublicKeysJson = addJson as Record<string, unknown>[];
    } catch (e) {
      return {
        parsed: null,
        error: `Add-keys JSON: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const trimmed = disableText.trim();
    if (trimmed) {
      const entries = trimmed.split(/[,\s]+/);
      const ids = entries.map(Number);
      if (
        entries.some(
          (entry, index) =>
            !/^\d+$/.test(entry) || !Number.isSafeInteger(ids[index]) || ids[index]! > 0xffffffff,
        )
      ) {
        return {
          parsed: null,
          error: 'Disable-key IDs must be comma/space-separated unsigned 32-bit integers.',
        };
      }
      disableKeyIds = ids;
    }
    return { parsed: { addPublicKeysJson, disableKeyIds }, error: null };
  }, [addText, disableText]);

  useEffect(() => {
    if (!parsed) {
      onOptionsChange(null);
      return;
    }
    const hasAdds = (parsed.addPublicKeysJson?.length ?? 0) > 0;
    const hasDisables = (parsed.disableKeyIds?.length ?? 0) > 0;
    if (!hasAdds && !hasDisables) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange(parsed);
  }, [parsed, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text
          as="label"
          htmlFor="identity-keys-add"
          fontSize="sm"
          color="gray.100"
          fontWeight={500}
          mb={1}
        >
          Keys to add (JSON array of IdentityPublicKeyInCreation objects)
        </Text>
        <Textarea
          id="identity-keys-add"
          rows={10}
          fontFamily="mono"
          fontSize="xs"
          bg="gray.800"
          borderColor="gray.700"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder='[{ "keyId": 5, "purpose": "AUTHENTICATION", "securityLevel": "HIGH", "type": "ECDSA_HASH160", "data": "...", "signature": "..." }]'
        />
      </Box>
      <Box>
        <Text
          as="label"
          htmlFor="identity-keys-disable"
          fontSize="sm"
          color="gray.100"
          fontWeight={500}
          mb={1}
        >
          Key IDs to disable
        </Text>
        <Textarea
          id="identity-keys-disable"
          rows={2}
          fontFamily="mono"
          fontSize="xs"
          bg="gray.800"
          borderColor="gray.700"
          value={disableText}
          onChange={(e) => setDisableText(e.target.value)}
          placeholder="e.g. 4, 5, 6"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          Master, critical-auth, and transfer keys cannot be disabled.
        </Text>
      </Box>
      {error ? (
        <Text fontSize="xs" color="danger">
          {error}
        </Text>
      ) : null}
    </VStack>
  );
}
