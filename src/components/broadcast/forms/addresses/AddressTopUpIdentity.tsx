'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import type { DerivationNetwork } from '@/signer/types';
import { isBase58Identifier } from '@util/identifier';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../fields';
import { AddressKeyField, CreditsField, useAddressKeyPreview } from './fields';
import {
  formatCredits,
  MIN_IDENTITY_FUNDING_CREDITS,
  minFee,
  parseCredits,
  shortfallError,
} from './limits';

export interface AddressTopUpIdentityOptions {
  network: DerivationNetwork;
  /** The identity that receives the credits. */
  identityId: string;
  inputKeyWif: string;
  fromAddress: string;
  amountCredits: bigint;
}

export function AddressTopUpIdentityForm({
  network,
  signer,
  onOptionsChange,
}: OperationFormProps<AddressTopUpIdentityOptions>) {
  const [identityId, setIdentityId] = useState(signer?.identityId ?? '');
  const [wif, setWif] = useState('');
  const [amountText, setAmountText] = useState('');
  const preview = useAddressKeyPreview(wif, network);
  const amount = parseCredits(amountText, { min: MIN_IDENTITY_FUNDING_CREDITS });
  const idValid = isBase58Identifier(identityId.trim());
  const shortfall =
    amount.amount === undefined
      ? null
      : shortfallError(preview.balance, amount.amount, minFee.topUpIdentity());

  useEffect(() => {
    if (!idValid || !preview.address || amount.amount === undefined || shortfall) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      identityId: identityId.trim(),
      inputKeyWif: wif.trim(),
      fromAddress: preview.address,
      amountCredits: amount.amount,
    });
  }, [
    idValid,
    identityId,
    preview.address,
    amount.amount,
    shortfall,
    wif,
    network,
    onOptionsChange,
  ]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormField
        label="Identity to top up"
        error={identityId && !idValid ? 'Enter a base58 identity ID.' : null}
      >
        <Input
          {...inputStyle}
          aria-label="Identity to top up"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
        />
      </FormField>
      <AddressKeyField
        label="Paying address private key (WIF)"
        value={wif}
        onChange={setWif}
        preview={preview}
        network={network}
      />
      <CreditsField
        value={amountText}
        onChange={setAmountText}
        error={(amountText && amount.error) || shortfall}
        hint={`At least ${formatCredits(MIN_IDENTITY_FUNDING_CREDITS)} credits. The address pays the fee on top from its remaining balance.`}
      />
    </VStack>
  );
}
