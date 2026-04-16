'use client';

import { useEffect, useState } from 'react';
import { FormControl, FormLabel, Input, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface IdentityTopUpOptions {
  identityId: string;
  amountDash: string;
}

export function IdentityTopUpForm({ signer, onOptionsChange }: OperationFormProps<IdentityTopUpOptions>) {
  const [identityId, setIdentityId] = useState(signer.identityId);
  const [amount, setAmount] = useState('0.1');

  useEffect(() => {
    const validId = isBase58Identifier(identityId.trim());
    const validAmount = Number(amount) > 0;
    if (!validId || !validAmount) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ identityId: identityId.trim(), amountDash: amount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, amount]);

  return (
    <VStack align="stretch" spacing={3}>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          Identity
        </FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          Amount (DASH)
        </FormLabel>
        <Input
          size="sm"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
    </VStack>
  );
}
