'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import { DocumentRefFields } from './DocumentRefFields';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentPurchaseOptions {
  contractId: string;
  documentType: string;
  documentId: string;
  priceCredits: bigint;
}

export function DocumentPurchaseForm({
  onOptionsChange,
}: OperationFormProps<DocumentPurchaseOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentType, setDocumentType] = useState(params.get('type') ?? '');
  const [documentId, setDocumentId] = useState(params.get('id') ?? '');
  const [priceStr, setPriceStr] = useState('');

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
      price <= 0n
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
      <DocumentRefFields
        contractId={contractId}
        documentType={documentType}
        documentId={documentId}
        onContractIdChange={setContractId}
        onDocumentTypeChange={setDocumentType}
        onDocumentIdChange={setDocumentId}
      />
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Confirm price (credits)
        </Text>
        <Input
          size="sm"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder="Match the listed price exactly"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          The price must match the document&apos;s on-chain listing or the
          purchase will fail.
        </Text>
      </Box>
    </VStack>
  );
}
