'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
  HStack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useSdkQuery } from '@sdk/hooks';
import { normaliseContract } from '@util/contract';
import { ContractPicker, rememberContract } from '../ContractPicker';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface ContractUpdateOptions {
  contractId: string;
  documentSchemas: Record<string, unknown>;
  definitions?: Record<string, unknown>;
}

export function ContractUpdateForm({
  onOptionsChange,
}: OperationFormProps<ContractUpdateOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [schemasText, setSchemasText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
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

  useEffect(() => {
    if (contractQuery.data && !loaded) {
      const norm = normaliseContract(contractQuery.data);
      setSchemasText(JSON.stringify(norm.documentSchemas ?? {}, null, 2));
      setLoaded(true);
    }
  }, [contractQuery.data, loaded]);

  const parsed = useMemo<Record<string, unknown> | null>(() => {
    if (!schemasText.trim()) return null;
    try {
      const json: unknown = JSON.parse(schemasText);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        setParseError('documentSchemas must be a JSON object.');
        return null;
      }
      setParseError(null);
      return json as Record<string, unknown>;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [schemasText]);

  useEffect(() => {
    if (!validContract || !parsed) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ contractId: contractId.trim(), documentSchemas: parsed });
  }, [validContract, parsed, contractId, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract
        </Text>
        <ContractPicker value={contractId} onChange={setContractId} />
      </Box>

      {contractQuery.data && loaded ? (
        <Box>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="sm" color="gray.100" fontWeight={500}>
              Document schemas
            </Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (contractQuery.data) {
                  const norm = normaliseContract(contractQuery.data);
                  setSchemasText(JSON.stringify(norm.documentSchemas ?? {}, null, 2));
                }
              }}
            >
              Reset to on-chain
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
          ) : null}
          <Text fontSize="xs" color="gray.400" mt={1}>
            Schema changes are append-only for required fields and bounded by the
            contract&apos;s mutability config.
          </Text>
        </Box>
      ) : contractQuery.isLoading ? (
        <Text fontSize="xs" color="gray.400">
          Loading contract…
        </Text>
      ) : null}
    </VStack>
  );
}
