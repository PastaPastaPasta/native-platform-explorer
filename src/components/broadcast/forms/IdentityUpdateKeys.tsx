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
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    let addPublicKeysJson: Record<string, unknown>[] | undefined;
    let disableKeyIds: number[] | undefined;
    try {
      const addJson: unknown = JSON.parse(addText);
      if (!Array.isArray(addJson)) {
        setError('Add-keys must be a JSON array.');
        return null;
      }
      addPublicKeysJson = addJson as Record<string, unknown>[];
    } catch (e) {
      setError(`Add-keys JSON: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }

    const trimmed = disableText.trim();
    if (trimmed) {
      const ids = trimmed
        .split(/[,\s]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n));
      if (ids.length === 0) {
        setError('Disable-key IDs must be comma/space-separated integers.');
        return null;
      }
      disableKeyIds = ids;
    }
    setError(null);
    return { addPublicKeysJson, disableKeyIds };
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
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Keys to add (JSON array of IdentityPublicKeyInCreation objects)
        </Text>
        <Textarea
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
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Key IDs to disable
        </Text>
        <Textarea
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
