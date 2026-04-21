'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useContract } from '@/sdk/queries';
import { normaliseContract, documentTypeNames } from '@util/contract';
import { isBase58Identifier } from '@util/identifier';
import { DeserializerInput } from './DeserializerInput';
import { DeserializerError, DeserializerResult } from './DeserializerOutput';

function StepIndicator({ step, active, done }: { step: number; active: boolean; done: boolean }) {
  return (
    <Box
      w={5}
      h={5}
      borderRadius="full"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize="2xs"
      fontWeight={600}
      flexShrink={0}
      bg={done ? 'rgba(0,141,228,0.2)' : active ? 'rgba(0,141,228,0.1)' : 'rgba(255,255,255,0.04)'}
      color={done ? 'brand.light' : active ? 'brand.normal' : 'gray.600'}
      border="1px solid"
      borderColor={done ? 'rgba(0,141,228,0.3)' : active ? 'rgba(0,141,228,0.2)' : 'rgba(255,255,255,0.08)'}
      transition="all 0.2s ease"
    >
      {done ? '✓' : step}
    </Box>
  );
}

export function DocumentDeserializerTool() {
  const [contractId, setContractId] = useState('');
  const [docType, setDocType] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const validContractId = isBase58Identifier(contractId) ? contractId : undefined;
  const contractQ = useContract(validContractId);

  const docTypes = useMemo(() => {
    if (!contractQ.data) return [];
    return documentTypeNames(normaliseContract(contractQ.data));
  }, [contractQ.data]);

  const hasContract = !!contractQ.data;
  const hasDocType = !!docType;
  const ready = hasContract && hasDocType;

  const handleDecode = useCallback(
    async (bytes: Uint8Array | null) => {
      if (!bytes || !contractQ.data || !docType) {
        setResult(null);
        setError(null);
        return;
      }
      try {
        const wasm = await import('@dashevo/evo-sdk');
        await wasm.ensureInitialized();
        const doc = wasm.Document.fromBytes(
          bytes,
          contractQ.data as InstanceType<typeof wasm.DataContract>,
          docType,
          wasm.PlatformVersion.latest(),
        );
        setResult(doc);
        setError(null);
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [contractQ.data, docType],
  );

  return (
    <InfoBlock>
      <VStack align="stretch" spacing={4}>
        <Text fontSize="xs" color="gray.400" lineHeight="1.6">
          Documents require their contract schema for deserialization.
          Enter the contract ID, pick a document type, then paste the raw bytes.
        </Text>

        <VStack align="stretch" spacing={3}>
          <HStack spacing={3} align="flex-start">
            <StepIndicator step={1} active={!hasContract} done={hasContract} />
            <FormControl flex={1}>
              <FormLabel fontSize="xs" color="gray.250" mb={1}>
                Contract ID
              </FormLabel>
              <Input
                size="sm"
                value={contractId}
                onChange={(e) => {
                  setContractId(e.target.value);
                  setDocType('');
                  setResult(null);
                  setError(null);
                }}
                placeholder="Base58 contract identifier"
                fontFamily="mono"
                fontSize="xs"
                bg="rgba(24,29,32,0.8)"
                borderColor="rgba(255,255,255,0.08)"
                borderRadius="lg"
                _focus={{ borderColor: 'rgba(0,141,228,0.4)', boxShadow: 'none' }}
              />
              {contractId && !validContractId ? (
                <Text fontSize="2xs" color="yellow.300" mt={1}>
                  Enter a valid base58 identifier (43–44 characters)
                </Text>
              ) : null}
              {contractQ.isLoading ? (
                <Text fontSize="2xs" color="gray.500" mt={1}>
                  Fetching contract…
                </Text>
              ) : null}
              {contractQ.error ? (
                <Text fontSize="2xs" color="red.300" mt={1}>
                  {contractQ.error.message}
                </Text>
              ) : null}
            </FormControl>
          </HStack>

          <HStack spacing={3} align="flex-start">
            <StepIndicator step={2} active={hasContract && !hasDocType} done={hasDocType} />
            <FormControl flex={1} isDisabled={!hasContract}>
              <FormLabel fontSize="xs" color="gray.250" mb={1}>
                Document type
              </FormLabel>
              <Select
                size="sm"
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value);
                  setResult(null);
                  setError(null);
                }}
                bg="rgba(24,29,32,0.8)"
                borderColor="rgba(255,255,255,0.08)"
                borderRadius="lg"
                fontSize="xs"
                placeholder={docTypes.length > 0 ? 'Select type' : hasContract ? 'No types found' : 'Waiting for contract…'}
                _focus={{ borderColor: 'rgba(0,141,228,0.4)', boxShadow: 'none' }}
              >
                {docTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FormControl>
          </HStack>

          <HStack spacing={3} align="flex-start">
            <StepIndicator step={3} active={ready} done={!!result} />
            <Box flex={1}>
              <DeserializerInput
                disabled={!ready}
                label={ready ? 'Document bytes' : 'Document bytes'}
                onDecode={handleDecode}
              />
            </Box>
          </HStack>
        </VStack>

        {error ? <DeserializerError message={error} /> : null}
        {result ? <DeserializerResult value={result} /> : null}
      </VStack>
    </InfoBlock>
  );
}
