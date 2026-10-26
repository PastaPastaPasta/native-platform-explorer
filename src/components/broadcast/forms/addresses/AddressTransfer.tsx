'use client';

import { useEffect, useState } from 'react';
import { Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import type { OperationFormProps } from '../../OperationShell';
import {
  AddressKeyStatus,
  AddressOutputsEditor,
  FormField,
  inputStyle,
  useAddressKeyPreview,
} from './fields';
import { formatCredits, minFee, shortfallError, sumOutputs, type AddressOutput } from './limits';

export interface AddressTransferOptions {
  network: 'mainnet' | 'testnet';
  /** WIF of the paying address. */
  inputKeyWif: string;
  /** The address the key controls, shown at review and checked again at signing. */
  fromAddress: string;
  outputs: AddressOutput[];
  /** Who pays the fee: the sender's remaining balance, or the single recipient. */
  feeFrom: 'sender' | 'recipient';
}

/** Review-safe view of an operation that carries an address key. */
export function redactAddressKey<T extends { inputKeyWif: string }>({
  inputKeyWif: _secret,
  ...rest
}: T) {
  return { ...rest, inputKey: 'provided (hidden)' };
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
  const shortfall = !outputs
    ? null
    : feeFrom === 'recipient'
      ? single && total < minFee.transfer(1, 1)
        ? `To pay the fee, the recipient must receive at least ${formatCredits(minFee.transfer(1, 1))} credits.`
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
      <FormField label="Sending address private key (WIF)">
        <SecretInput
          {...inputStyle}
          aria-label="Sending address private key (WIF)"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
        />
        <AddressKeyStatus preview={preview} network={network} />
      </FormField>
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
