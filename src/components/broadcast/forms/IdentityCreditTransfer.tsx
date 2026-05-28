'use client';

import { useEffect, useState } from 'react';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface IdentityCreditTransferOptions {
  recipientId: string;
  amountCredits: bigint;
}

export function IdentityCreditTransferForm({
  onOptionsChange,
}: OperationFormProps<IdentityCreditTransferOptions>) {
  const [recipientId, setRecipientId] = useState('');
  const [amountStr, setAmountStr] = useState('');

  useEffect(() => {
    let amount: bigint | null = null;
    try {
      amount = BigInt(amountStr.trim());
    } catch {
      amount = null;
    }
    if (
      !isBase58Identifier(recipientId.trim()) ||
      amount === null ||
      amount <= 0n
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      recipientId: recipientId.trim(),
      amountCredits: amount,
    });
  }, [recipientId, amountStr, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
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
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Amount (credits)
        </Text>
        <Input
          size="sm"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder="e.g. 100000000"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          1 DASH ≈ 100,000,000,000 credits. Use the credit converter on the
          identity page to estimate.
        </Text>
      </Box>
    </VStack>
  );
}
