'use client';

import { useEffect, useState } from 'react';
import { VStack } from '@chakra-ui/react';
import {
  DEFAULT_NEW_IDENTITY_KEYS,
  newIdentityKeyCount,
  type NewIdentityKeyChoice,
} from '@/signer/new-identity';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { NewIdentityKeysFields } from '../identity/NewIdentityKeysFields';
import { AddressKeyField, CreditsField, useAddressKeyPreview } from './fields';
import {
  formatCredits,
  MIN_IDENTITY_FUNDING_CREDITS,
  minFee,
  parseCredits,
  shortfallError,
} from './limits';

export interface AddressCreateIdentityOptions {
  network: DerivationNetwork;
  inputKeyWif: string;
  fromAddress: string;
  /** Credits moved from the address into the new identity. */
  amountCredits: bigint;
  keys: NewIdentityKeyChoice;
}

export function AddressCreateIdentityForm({
  network,
  onOptionsChange,
}: OperationFormProps<AddressCreateIdentityOptions>) {
  const [wif, setWif] = useState('');
  const [amountText, setAmountText] = useState('');
  const [keys, setKeys] = useState<NewIdentityKeyChoice | null>(null);
  const preview = useAddressKeyPreview(wif, network);
  const amount = parseCredits(amountText, { min: MIN_IDENTITY_FUNDING_CREDITS });
  const keyCount = keys ? newIdentityKeyCount(keys.source) : DEFAULT_NEW_IDENTITY_KEYS.length;
  const shortfall =
    amount.amount === undefined
      ? null
      : shortfallError(preview.balance, amount.amount, minFee.createIdentity(keyCount));

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
      <AddressKeyField
        label="Paying address private key (WIF)"
        value={wif}
        onChange={setWif}
        preview={preview}
        network={network}
      />
      <CreditsField
        label="Amount for the new identity (credits)"
        value={amountText}
        onChange={setAmountText}
        error={(amountText && amount.error) || shortfall}
        hint={`At least ${formatCredits(MIN_IDENTITY_FUNDING_CREDITS)} credits. The address pays the fee on top from its remaining balance. The identity ID is derived from the address and its nonce, and is shown once Platform confirms the identity.`}
      />
      <NewIdentityKeysFields network={network} onChange={setKeys} />
    </VStack>
  );
}
