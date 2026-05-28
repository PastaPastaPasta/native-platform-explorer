'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import { ContractPicker } from '../ContractPicker';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentDeleteOptions {
  contractId: string;
  documentType: string;
  documentId: string;
}

export function DocumentDeleteForm({
  onOptionsChange,
}: OperationFormProps<DocumentDeleteOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentType, setDocumentType] = useState(params.get('type') ?? '');
  const [documentId, setDocumentId] = useState(params.get('id') ?? '');

  useEffect(() => {
    if (
      !isBase58Identifier(contractId.trim()) ||
      !isBase58Identifier(documentId.trim()) ||
      !documentType.trim()
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      documentType: documentType.trim(),
      documentId: documentId.trim(),
    });
  }, [contractId, documentType, documentId, onOptionsChange]);

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
          borderColor={
            documentId && !isBase58Identifier(documentId.trim()) ? 'danger' : 'gray.700'
          }
        />
      </Box>
      <Text fontSize="xs" color="warning">
        Deleting a document is permanent — there is no undo.
      </Text>
    </VStack>
  );
}
