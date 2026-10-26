'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import { platformAddressError, platformAddressHrp } from '@util/platform-address';
import type { OperationFormProps } from '../../OperationShell';
import { AssetLockProofFields } from '../identity/AssetLockFields';
import type { ParsedAssetLockProof } from '../identity/asset-lock';
import { FormField, inputStyle } from './fields';

export interface AddressFundFromAssetLockOptions {
  network: 'mainnet' | 'testnet';
  /** The Platform address that receives the asset lock's value, less the fee. */
  address: string;
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
}

/** Review-safe view of an operation that carries the one-time asset-lock key. */
export function redactAssetLockKey<T extends { assetLockKeyWif: string }>({
  assetLockKeyWif: _secret,
  ...rest
}: T) {
  return { ...rest, assetLockKey: 'provided (hidden)' };
}

export function AddressFundFromAssetLockForm({
  network,
  onOptionsChange,
}: OperationFormProps<AddressFundFromAssetLockOptions>) {
  const [address, setAddress] = useState('');
  const [proof, setProof] = useState<ParsedAssetLockProof | null>(null);
  const [wif, setWif] = useState('');
  const addressError = address.trim() ? platformAddressError(address, network) : null;

  useEffect(() => {
    if (!address.trim() || addressError || !proof || !wif.trim()) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      address: address.trim().toLowerCase(),
      proof,
      assetLockKeyWif: wif.trim(),
    });
  }, [address, addressError, proof, wif, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <AssetLockProofFields onChange={setProof} />
      <FormField
        label="Asset-lock private key (WIF)"
        hint="The one-time key of the asset-lock output. It signs the proof and stays in this tab only for this operation."
      >
        <SecretInput
          {...inputStyle}
          aria-label="Asset-lock private key (WIF)"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
        />
      </FormField>
      <FormField
        label="Platform address to fund"
        error={addressError}
        hint="It receives the whole asset-lock value less Platform's fee."
      >
        <Input
          {...inputStyle}
          aria-label="Platform address to fund"
          placeholder={`${platformAddressHrp(network)}1…`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormField>
    </VStack>
  );
}
