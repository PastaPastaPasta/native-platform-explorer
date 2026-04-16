'use client';

import { useEffect, useState } from 'react';
import { FormControl, FormLabel, Input, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { validateLabel } from '@util/dpns';
import { isBase58Identifier } from '@util/identifier';

export interface DpnsRegisterOptions {
  label: string;
  identityId: string;
}

export function DpnsRegisterForm({ signer, onOptionsChange }: OperationFormProps<DpnsRegisterOptions>) {
  const [identityId, setIdentityId] = useState(signer.identityId);
  const [label, setLabel] = useState('');

  const labelCheck = label ? validateLabel(label) : { valid: false };

  useEffect(() => {
    const validId = isBase58Identifier(identityId.trim());
    if (!validId || !labelCheck.valid) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ label: label.trim().toLowerCase(), identityId: identityId.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, label]);

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
          Label (will be registered as {label || '…'}.dash)
        </FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
        {label && !labelCheck.valid ? (
          <Text color="warning" fontSize="xs" mt={1}>
            {'reason' in labelCheck ? labelCheck.reason : 'Invalid label'}
          </Text>
        ) : null}
      </FormControl>
    </VStack>
  );
}
