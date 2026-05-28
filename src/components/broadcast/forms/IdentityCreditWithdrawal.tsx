'use client';

import { useEffect, useState } from 'react';
import { Box, Input, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';

export interface IdentityCreditWithdrawalOptions {
  toAddress: string;
  amountCredits: bigint;
  coreFeePerByte?: number;
}

export function IdentityCreditWithdrawalForm({
  onOptionsChange,
}: OperationFormProps<IdentityCreditWithdrawalOptions>) {
  const [toAddress, setToAddress] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [feePerByte, setFeePerByte] = useState('1');

  useEffect(() => {
    let amount: bigint | null = null;
    try {
      amount = BigInt(amountStr.trim());
    } catch {
      amount = null;
    }
    const fee = Number(feePerByte);
    if (
      toAddress.trim().length < 26 ||
      amount === null ||
      amount <= 0n ||
      !Number.isFinite(fee) ||
      fee < 1
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      toAddress: toAddress.trim(),
      amountCredits: amount,
      coreFeePerByte: fee,
    });
  }, [toAddress, amountStr, feePerByte, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Destination Dash Core address
        </Text>
        <Input
          size="sm"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder="X… (mainnet) or y… (testnet)"
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
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          ≥ 190,000 credits required after fees.
        </Text>
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Core fee per byte
        </Text>
        <Input
          size="sm"
          type="number"
          min={1}
          value={feePerByte}
          onChange={(e) => setFeePerByte(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
      </Box>
    </VStack>
  );
}
