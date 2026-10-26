'use client';

import { useEffect, useState } from 'react';
import { Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { FormField } from '../fields';
import { AddressKeyField, AddressOutputsEditor, useAddressKeyPreview } from './fields';
import { formatCredits, minFee, shortfallError, sumOutputs, type AddressOutput } from './limits';

export interface AddressTransferOptions {
  network: DerivationNetwork;
  /** WIF of the paying address. */
  inputKeyWif: string;
  /** The address the key controls, shown at review and checked again at signing. */
  fromAddress: string;
  outputs: AddressOutput[];
  /** Who pays the fee: the sender's remaining balance, or the single recipient. */
  feeFrom: 'sender' | 'recipient';
}

export function AddressTransferForm({
  network,
  onOptionsChange,
}: OperationFormProps<AddressTransferOptions>) {
  const [wif, setWif] = useState('');
  const [outputs, setOutputs] = useState<AddressOutput[] | null>(null);
  const [feeFrom, setFeeFrom] = useState<'sender' | 'recipient'>('sender');
  const preview = useAddressKeyPreview(wif, network);
  const single = outputs?.length === 1;
  const total = outputs ? sumOutputs(outputs) : 0n;
  const recipientMin = minFee.transfer(1, 1);
  const shortfall = !outputs
    ? null
    : feeFrom === 'recipient'
      ? single && total < recipientMin
        ? `To pay the fee, the recipient must receive at least ${formatCredits(recipientMin)} credits.`
        : shortfallError(preview.balance, total, 0n)
      : shortfallError(preview.balance, total, minFee.transfer(1, outputs.length));

  useEffect(() => {
    if (!preview.address || !outputs || shortfall || (feeFrom === 'recipient' && !single)) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      inputKeyWif: wif.trim(),
      fromAddress: preview.address,
      outputs,
      feeFrom,
    });
  }, [preview.address, outputs, shortfall, feeFrom, single, wif, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <AddressKeyField
        label="Sending address private key (WIF)"
        value={wif}
        onChange={setWif}
        preview={preview}
        network={network}
      />
      <FormField label="Recipients">
        <AddressOutputsEditor network={network} from={preview.address} onChange={setOutputs} />
      </FormField>
      <FormField
        label="Fee"
        error={shortfall}
        hint={
          feeFrom === 'sender'
            ? `The sending address pays ${outputs ? formatCredits(total) : 'the total'} credits plus the fee, so it must hold more than the total.`
            : 'The fee is taken from what the recipient receives.'
        }
      >
        <RadioGroup
          value={feeFrom}
          onChange={(value) => setFeeFrom(value as 'sender' | 'recipient')}
        >
          <Stack spacing={1}>
            <Radio value="sender" size="sm">
              <Text fontSize="sm">The sending address pays the fee from its remaining balance</Text>
            </Radio>
            <Radio value="recipient" size="sm" isDisabled={!single}>
              <Text fontSize="sm">Deduct the fee from the recipient (one recipient only)</Text>
            </Radio>
          </Stack>
        </RadioGroup>
      </FormField>
    </VStack>
  );
}
