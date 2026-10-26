'use client';

import { useEffect, useState } from 'react';
import { Input, Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import { isBase58Identifier } from '@util/identifier';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../addresses/fields';
import { AssetLockProofFields } from './AssetLockFields';
import { BridgeHandoff } from './BridgeHandoff';
import type { ParsedAssetLockProof } from './asset-lock';

export interface IdentityTopUpOptions {
  network: 'mainnet' | 'testnet';
  identityId: string;
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
}

export function IdentityTopUpForm({
  network,
  signer,
  onOptionsChange,
}: OperationFormProps<IdentityTopUpOptions>) {
  const [mode, setMode] = useState<'bridge' | 'proof'>('bridge');
  const [identityId, setIdentityId] = useState(signer?.identityId ?? '');
  const [proof, setProof] = useState<ParsedAssetLockProof | null>(null);
  const [wif, setWif] = useState('');
  const idValid = isBase58Identifier(identityId.trim());

  useEffect(() => {
    if (mode !== 'proof' || !idValid || !proof || !wif.trim()) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ network, identityId: identityId.trim(), proof, assetLockKeyWif: wif.trim() });
  }, [mode, idValid, identityId, proof, wif, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormField
        label="Identity"
        error={identityId && !idValid ? 'Enter a base58 identity ID.' : null}
      >
        <Input
          {...inputStyle}
          aria-label="Identity"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
        />
      </FormField>
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
        <BridgeHandoff action="topUp" />
      ) : (
        <>
          <AssetLockProofFields onChange={setProof} />
          <FormField
            label="Asset-lock private key (WIF)"
            hint="The one-time key of the asset-lock output. It signs the proof and stays in this tab only for this operation. Platform credits the asset lock's value, less the fee, to the identity."
          >
            <SecretInput
              {...inputStyle}
              aria-label="Asset-lock private key (WIF)"
              value={wif}
              onChange={(e) => setWif(e.target.value)}
            />
          </FormField>
        </>
      )}
    </VStack>
  );
}
