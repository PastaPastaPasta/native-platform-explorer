'use client';

import { useEffect, useState } from 'react';
import { Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import type { NewIdentityKeySource } from '@/signer/new-identity';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../addresses/fields';
import { AssetLockProofFields } from './AssetLockFields';
import { BridgeHandoff } from './BridgeHandoff';
import { NewIdentityKeysFields, redactNewIdentityKeys } from './NewIdentityKeysFields';
import type { ParsedAssetLockProof } from './asset-lock';

export interface IdentityCreateOptions {
  network: 'mainnet' | 'testnet';
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
  keys: NewIdentityKeySource;
}

export function redactIdentityCreate({
  assetLockKeyWif: _secret,
  keys,
  ...rest
}: IdentityCreateOptions) {
  return { ...rest, assetLockKey: 'provided (hidden)', keys: redactNewIdentityKeys(keys) };
}

export function IdentityCreateForm({
  network,
  onOptionsChange,
}: OperationFormProps<IdentityCreateOptions>) {
  const [mode, setMode] = useState<'bridge' | 'proof'>('bridge');
  const [proof, setProof] = useState<ParsedAssetLockProof | null>(null);
  const [wif, setWif] = useState('');
  const [keys, setKeys] = useState<NewIdentityKeySource | null>(null);

  useEffect(() => {
    if (mode !== 'proof' || !proof || !wif.trim() || !keys) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ network, proof, assetLockKeyWif: wif.trim(), keys });
  }, [mode, proof, wif, keys, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <RadioGroup value={mode} onChange={(value) => setMode(value as 'bridge' | 'proof')}>
        <Stack spacing={1}>
          <Radio value="bridge" size="sm">
            <Text fontSize="sm">Use the bridge (no Core wallet needed)</Text>
          </Radio>
          <Radio value="proof" size="sm">
            <Text fontSize="sm">
              I have an asset-lock proof and its private key from a Core wallet
            </Text>
          </Radio>
        </Stack>
      </RadioGroup>
      {mode === 'bridge' ? (
        <BridgeHandoff action="create" />
      ) : (
        <>
          <AssetLockProofFields showIdentityId onChange={setProof} />
          <FormField
            label="Asset-lock private key (WIF)"
            hint="The one-time key of the asset-lock output. It signs the proof and stays in this tab only for this operation. The new identity receives the asset lock's value, less the fee."
          >
            <SecretInput
              {...inputStyle}
              aria-label="Asset-lock private key (WIF)"
              value={wif}
              onChange={(e) => setWif(e.target.value)}
            />
          </FormField>
          <NewIdentityKeysFields network={network} onChange={setKeys} />
        </>
      )}
    </VStack>
  );
}
