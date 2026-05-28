'use client';

import { Box, Input, Text, VStack } from '@chakra-ui/react';
import { ContractPicker } from '../ContractPicker';
import { isBase58Identifier } from '@util/identifier';

interface DocumentRefFieldsProps {
  contractId: string;
  documentType: string;
  documentId: string;
  onContractIdChange: (value: string) => void;
  onDocumentTypeChange: (value: string) => void;
  onDocumentIdChange: (value: string) => void;
  /** When true, the document-ID input shows a red border on invalid base58.
   *  Defaults to false to match the SetPrice/Purchase forms. */
  validateDocumentId?: boolean;
}

/** Shared Contract picker + Document type + Document ID inputs used by the
 *  document delete / transfer / setPrice / purchase forms. */
export function DocumentRefFields({
  contractId,
  documentType,
  documentId,
  onContractIdChange,
  onDocumentTypeChange,
  onDocumentIdChange,
  validateDocumentId = false,
}: DocumentRefFieldsProps) {
  const docIdBorder =
    validateDocumentId && documentId && !isBase58Identifier(documentId.trim())
      ? 'danger'
      : 'gray.700';

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract
        </Text>
        <ContractPicker value={contractId} onChange={onContractIdChange} />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Document type
        </Text>
        <Input
          size="sm"
          value={documentType}
          onChange={(e) => onDocumentTypeChange(e.target.value)}
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
          onChange={(e) => onDocumentIdChange(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor={docIdBorder}
        />
      </Box>
    </VStack>
  );
}
