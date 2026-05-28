'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text, VStack } from '@chakra-ui/react';
import { DocumentRefFields } from './DocumentRefFields';
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
      <DocumentRefFields
        contractId={contractId}
        documentType={documentType}
        documentId={documentId}
        onContractIdChange={setContractId}
        onDocumentTypeChange={setDocumentType}
        onDocumentIdChange={setDocumentId}
        validateDocumentId
      />
      <Text fontSize="xs" color="warning">
        Deleting a document is permanent — there is no undo.
      </Text>
    </VStack>
  );
}
