'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import {
  DEFAULT_NEW_IDENTITY_KEYS,
  newIdentityKeyCount,
  type NewIdentityKeySource,
} from '@/signer/new-identity';
import type { OperationFormProps } from '../../OperationShell';
import { NewIdentityKeysFields, redactNewIdentityKeys } from '../identity/NewIdentityKeysFields';
import { AddressKeyStatus, FormField, inputStyle, useAddressKeyPreview } from './fields';
import {
  formatCredits,
  MIN_IDENTITY_FUNDING_CREDITS,
  minFee,
  parseCredits,
  shortfallError,
} from './limits';

export interface AddressCreateIdentityOptions {
  network: 'mainnet' | 'testnet';
  inputKeyWif: string;
  fromAddress: string;
  /** Credits moved from the address into the new identity. */
  amountCredits: bigint;
  keys: NewIdentityKeySource;
}

export function redactAddressCreateIdentity({
  inputKeyWif: _secret,
  keys,
  ...rest
}: AddressCreateIdentityOptions) {
  return { ...rest, inputKey: 'provided (hidden)', keys: redactNewIdentityKeys(keys) };
}

export function AddressCreateIdentityForm({
  network,
  onOptionsChange,
}: OperationFormProps<AddressCreateIdentityOptions>) {
  const [wif, setWif] = useState('');
  const [amountText, setAmountText] = useState('');
  const [keys, setKeys] = useState<NewIdentityKeySource | null>(null);
  const preview = useAddressKeyPreview(wif, network);
  const amount = parseCredits(amountText, { min: MIN_IDENTITY_FUNDING_CREDITS });
  const shortfall =
    amount.amount === undefined
      ? null
      : shortfallError(
          preview.balance,
          amount.amount,
          minFee.createIdentity(
            keys ? newIdentityKeyCount(keys) : DEFAULT_NEW_IDENTITY_KEYS.length,
          ),
        );

  useEffect(() => {
    if (!preview.address || amount.amount === undefined || shortfall || !keys) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      inputKeyWif: wif.trim(),
      fromAddress: preview.address,
      amountCredits: amount.amount,
      keys,
    });
  }, [preview.address, amount.amount, shortfall, keys, wif, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormField label="Paying address private key (WIF)">
        <SecretInput
          {...inputStyle}
          aria-label="Paying address private key (WIF)"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
        />
        <AddressKeyStatus preview={preview} network={network} />
      </FormField>
      <FormField
        label="Amount for the new identity (credits)"
        error={(amountText && amount.error) || shortfall}
        hint={`At least ${formatCredits(MIN_IDENTITY_FUNDING_CREDITS)} credits. The address pays the fee on top from its remaining balance. The identity ID is derived from the address and its nonce, and is shown once Platform confirms the identity.`}
      >
        <Input
          {...inputStyle}
          inputMode="numeric"
          aria-label="Amount (credits)"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
      </FormField>
      <NewIdentityKeysFields network={network} onChange={setKeys} />
    </VStack>
  );
}
