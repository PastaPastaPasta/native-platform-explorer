'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import { ContractPicker } from '../ContractPicker';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentSetPriceOptions {
  contractId: string;
  documentType: string;
  documentId: string;
  priceCredits: bigint;
}

export function DocumentSetPriceForm({
  onOptionsChange,
}: OperationFormProps<DocumentSetPriceOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentType, setDocumentType] = useState(params.get('type') ?? '');
  const [documentId, setDocumentId] = useState(params.get('id') ?? '');
  const [priceStr, setPriceStr] = useState('0');

  useEffect(() => {
    let price: bigint | null = null;
    try {
      price = BigInt(priceStr.trim());
    } catch {
      price = null;
    }
    if (
      !isBase58Identifier(contractId.trim()) ||
      !isBase58Identifier(documentId.trim()) ||
      !documentType.trim() ||
      price === null ||
      price < 0n
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      documentType: documentType.trim(),
      documentId: documentId.trim(),
      priceCredits: price,
    });
  }, [contractId, documentType, documentId, priceStr, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract
        </Text>
        <ContractPicker value={contractId} onChange={setContractId} />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Document type
        </Text>
        <Input
          size="sm"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Document ID
        </Text>
        <Input
          size="sm"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Price (credits)
        </Text>
        <Input
          size="sm"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder="e.g. 100000000"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          Set to <strong>0</strong> to remove the listing.
        </Text>
      </Box>
    </VStack>
  );
}
