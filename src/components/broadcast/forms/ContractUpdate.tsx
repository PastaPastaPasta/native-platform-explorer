'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Button, HStack, Text, Textarea, VStack } from '@chakra-ui/react';
import { useSdkQuery } from '@sdk/hooks';
import { normaliseContract } from '@util/contract';
import { ContractPicker, rememberContract } from '../ContractPicker';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';
import { ContractDefinitionsField, parseDefinitionsText } from './ContractDefinitionsField';

export interface ContractUpdateOptions {
  contractId: string;
  /** On-chain version the edits were made against; the update publishes baseVersion + 1. */
  baseVersion?: number;
  documentSchemas: Record<string, unknown>;
  /** Replacement `$defs`. Undefined keeps the on-chain definitions; null removes them. */
  definitions?: Record<string, unknown> | null;
}

function onChainText(contract: unknown) {
  const norm = normaliseContract(contract);
  const defs = norm.plain?.schemaDefs;
  return {
    schemas: JSON.stringify(norm.documentSchemas ?? {}, null, 2),
    definitions:
      defs && typeof defs === 'object' && Object.keys(defs).length > 0
        ? JSON.stringify(defs, null, 2)
        : '',
    version: norm.version === undefined ? undefined : Number(norm.version),
  };
}

export function ContractUpdateForm({ onOptionsChange }: OperationFormProps<ContractUpdateOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [schemasText, setSchemasText] = useState('');
  const [definitionsText, setDefinitionsText] = useState('');
  const [baseVersion, setBaseVersion] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  const validContract = isBase58Identifier(contractId.trim());

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

  const resetToOnChain = useCallback((contract: unknown) => {
    const text = onChainText(contract);
    setSchemasText(text.schemas);
    setDefinitionsText(text.definitions);
    setBaseVersion(text.version);
  }, []);

  useEffect(() => {
    if (contractQuery.data && !loaded) {
      resetToOnChain(contractQuery.data);
      setLoaded(true);
    }
  }, [contractQuery.data, loaded, resetToOnChain]);

  const { parsed, parseError } = useMemo(() => {
    if (!schemasText.trim()) return { parsed: null, parseError: null };
    try {
      const json: unknown = JSON.parse(schemasText);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return { parsed: null, parseError: 'documentSchemas must be a JSON object.' };
      }
      return { parsed: json as Record<string, unknown>, parseError: null };
    } catch (e) {
      return { parsed: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  }, [schemasText]);
  const { definitions, error: definitionsError } = useMemo(
    () => parseDefinitionsText(definitionsText),
    [definitionsText],
  );

  useEffect(() => {
    if (!validContract || !loaded || !parsed || definitionsError) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      baseVersion,
      documentSchemas: parsed,
      definitions,
    });
  }, [
    validContract,
    loaded,
    parsed,
    definitions,
    definitionsError,
    baseVersion,
    contractId,
    onOptionsChange,
  ]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract
        </Text>
        <ContractPicker
          value={contractId}
          onChange={(id) => {
            setContractId(id);
            if (id.trim() === contractId.trim()) return;
            setLoaded(false);
            setSchemasText('');
            setDefinitionsText('');
            setBaseVersion(undefined);
          }}
        />
      </Box>

      {contractQuery.data && loaded ? (
        <>
          <Box>
            <HStack justify="space-between" mb={1}>
              <Text
                as="label"
                htmlFor="contract-update-schemas"
                fontSize="sm"
                color="gray.100"
                fontWeight={500}
              >
                Document schemas
              </Text>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (contractQuery.data) resetToOnChain(contractQuery.data);
                }}
              >
                Reset to on-chain
              </Button>
            </HStack>
            <Textarea
              id="contract-update-schemas"
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
            ) : null}
            <Text fontSize="xs" color="gray.400" mt={1}>
              Schema changes are append-only for required fields and bounded by the contract&apos;s
              mutability config.
            </Text>
          </Box>
          <ContractDefinitionsField
            id="contract-update-definitions"
            value={definitionsText}
            error={definitionsError}
            onChange={setDefinitionsText}
            hint="Loaded from the on-chain contract and published with the schemas. Clearing this removes the existing definitions."
          />
          <Text fontSize="xs" color="gray.400">
            {baseVersion !== undefined
              ? `Publishes version ${baseVersion + 1} (on-chain version ${baseVersion}). `
              : ''}
            Groups, tokens, and contract config are kept unchanged.
          </Text>
        </>
      ) : contractQuery.isLoading ? (
        <Text fontSize="xs" color="gray.400">
          Loading contract…
        </Text>
      ) : null}
    </VStack>
  );
}
