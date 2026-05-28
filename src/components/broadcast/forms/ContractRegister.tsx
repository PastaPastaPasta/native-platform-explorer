'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Input,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import type { OperationFormProps } from '../OperationShell';

export interface ContractRegisterOptions {
  ownerId: string;
  documentSchemas: Record<string, unknown>;
  definitions?: Record<string, unknown>;
}

const SAMPLE_SCHEMA: Record<string, unknown> = {
  note: {
    type: 'object',
    documentsMutable: true,
    canBeDeleted: true,
    properties: {
      title: { type: 'string', maxLength: 100, position: 0 },
      body: { type: 'string', maxLength: 4096, position: 1 },
    },
    required: ['title'],
    additionalProperties: false,
  },
};

function validateSchemasShape(parsed: unknown): {
  ok: boolean;
  message?: string;
  schemas?: Record<string, unknown>;
} {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'documentSchemas must be a JSON object.' };
  }
  const map = parsed as Record<string, unknown>;
  const names = Object.keys(map);
  if (names.length === 0) {
    return { ok: false, message: 'Need at least one document type.' };
  }
  for (const n of names) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(n)) {
      return {
        ok: false,
        message: `Document-type name "${n}" is invalid (alphanumeric, dash, underscore).`,
      };
    }
    const entry = map[n];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, message: `Document type "${n}" must be a JSON object.` };
    }
    const e = entry as Record<string, unknown>;
    if (e.type !== 'object') {
      return { ok: false, message: `Document type "${n}" must have type: "object".` };
    }
    if (!e.properties || typeof e.properties !== 'object') {
      return { ok: false, message: `Document type "${n}" must have a properties object.` };
    }
  }
  return { ok: true, schemas: map };
}

export function ContractRegisterForm({
  signer,
  onOptionsChange,
}: OperationFormProps<ContractRegisterOptions>) {
  const [ownerId, setOwnerId] = useState(signer.identityId);
  const [schemasText, setSchemasText] = useState(() =>
    JSON.stringify(SAMPLE_SCHEMA, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      const json = JSON.parse(schemasText);
      const v = validateSchemasShape(json);
      if (!v.ok) {
        setParseError(v.message ?? 'Invalid schemas.');
        return null;
      }
      setParseError(null);
      return v.schemas!;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [schemasText]);

  useEffect(() => {
    if (!parsed) {
      onOptionsChange(null);
      return;
    }
    if (!ownerId.trim()) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      ownerId: ownerId.trim(),
      documentSchemas: parsed,
    });
  }, [parsed, ownerId, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Owner identity
        </Text>
        <Input
          size="sm"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          Pre-filled from your connected signer. The contract will be owned by
          this identity.
        </Text>
      </Box>

      <Box>
        <HStack justify="space-between" align="baseline" mb={1}>
          <Text fontSize="sm" color="gray.100" fontWeight={500}>
            Document schemas
          </Text>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSchemasText(JSON.stringify(SAMPLE_SCHEMA, null, 2))}
          >
            Reset to sample
          </Button>
        </HStack>
        <Textarea
          rows={18}
          fontFamily="mono"
          fontSize="xs"
          bg="gray.800"
          borderColor={parseError ? 'danger' : 'gray.700'}
          value={schemasText}
          onChange={(e) => setSchemasText(e.target.value)}
        />
        {parseError ? (
          <Text fontSize="xs" color="danger" mt={1}>
            {parseError}
          </Text>
        ) : (
          <Text fontSize="xs" color="gray.400" mt={1}>
            Each top-level key is a document type name. Inside, use{' '}
            <Code fontSize="xs">type: &quot;object&quot;</Code>,{' '}
            <Code fontSize="xs">properties</Code>, and optionally{' '}
            <Code fontSize="xs">required</Code> and{' '}
            <Code fontSize="xs">indices</Code>.
          </Text>
        )}
      </Box>

      <InfoBlock>
        <Heading size="xs" color="gray.100" mb={2}>
          Tips
        </Heading>
        <VStack align="stretch" spacing={1} fontSize="xs" color="gray.250">
          <Text>
            • Properties get a <Code fontSize="xs">position</Code> number, 0-indexed
            in declaration order — they pin the on-chain encoding.
          </Text>
          <Text>
            • Set <Code fontSize="xs">additionalProperties: false</Code> unless
            you really want a free-form schema.
          </Text>
          <Text>
            • Add an <Code fontSize="xs">indices</Code> array to a type to make
            specific fields queryable later.
          </Text>
        </VStack>
      </InfoBlock>
    </VStack>
  );
}
