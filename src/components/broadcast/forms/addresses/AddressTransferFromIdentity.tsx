'use client';

import { useEffect, useState } from 'react';
import { Text, VStack } from '@chakra-ui/react';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { FormField } from '../fields';
import { AddressOutputsEditor } from './fields';
import type { AddressOutput } from './limits';

export interface AddressTransferFromIdentityOptions {
  network: DerivationNetwork;
  outputs: AddressOutput[];
}

export function AddressTransferFromIdentityForm({
  network,
  signer,
  onOptionsChange,
}: OperationFormProps<AddressTransferFromIdentityOptions>) {
  const [outputs, setOutputs] = useState<AddressOutput[] | null>(null);

  useEffect(() => {
    onOptionsChange(outputs ? { network, outputs } : null);
  }, [outputs, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Text fontSize="sm" color="gray.250">
        Credits leave {signer?.identityId ?? 'the connected identity'}, signed with its CRITICAL
        transfer key. Platform deducts the fee from the identity balance.
      </Text>
      <FormField label="Recipient Platform addresses">
        <AddressOutputsEditor network={network} onChange={setOutputs} />
      </FormField>
    </VStack>
  );
}
