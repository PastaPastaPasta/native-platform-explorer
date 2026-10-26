'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import type { DerivationNetwork } from '@/signer/types';
import { platformAddressError, platformAddressHrp } from '@util/platform-address';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../fields';
import { AssetLockKeyField, AssetLockProofFields } from '../identity/AssetLockFields';
import type { ParsedAssetLockProof } from '../identity/asset-lock';

export interface AddressFundFromAssetLockOptions {
  network: DerivationNetwork;
  /** The Platform address that receives the asset lock's value, less the fee. */
  address: string;
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
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
      <AssetLockKeyField value={wif} onChange={setWif} hint="" />
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
