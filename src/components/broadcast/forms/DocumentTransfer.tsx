'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import { ContractPicker } from '../ContractPicker';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface DocumentTransferOptions {
  contractId: string;
  documentType: string;
  documentId: string;
  recipientId: string;
}

export function DocumentTransferForm({
  onOptionsChange,
}: OperationFormProps<DocumentTransferOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentType, setDocumentType] = useState(params.get('type') ?? '');
  const [documentId, setDocumentId] = useState(params.get('id') ?? '');
  const [recipientId, setRecipientId] = useState('');

  useEffect(() => {
    const ok =
      isBase58Identifier(contractId.trim()) &&
      isBase58Identifier(documentId.trim()) &&
      isBase58Identifier(recipientId.trim()) &&
      documentType.trim().length > 0;
    if (!ok) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      documentType: documentType.trim(),
      documentId: documentId.trim(),
      recipientId: recipientId.trim(),
    });
  }, [contractId, documentType, documentId, recipientId, onOptionsChange]);

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
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Recipient identity
        </Text>
        <Input
          size="sm"
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor={
            recipientId && !isBase58Identifier(recipientId.trim()) ? 'danger' : 'gray.700'
          }
          placeholder="Base58 identity ID"
        />
      </Box>
    </VStack>
  );
}
