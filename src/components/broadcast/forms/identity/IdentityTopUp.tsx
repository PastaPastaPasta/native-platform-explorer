'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import { isBase58Identifier } from '@util/identifier';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../fields';
import { AssetLockKeyField, AssetLockProofFields } from './AssetLockFields';
import { BridgeHandoff, FundingModeChoice, type FundingMode } from './BridgeHandoff';
import type { ParsedAssetLockProof } from './asset-lock';

export interface IdentityTopUpOptions {
  network: DerivationNetwork;
  identityId: string;
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
}

export function IdentityTopUpForm({
  network,
  signer,
  onOptionsChange,
}: OperationFormProps<IdentityTopUpOptions>) {
  const [mode, setMode] = useState<FundingMode>('bridge');
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
      <FundingModeChoice value={mode} onChange={setMode} />
      {mode === 'bridge' ? (
        <BridgeHandoff action="topUp" />
      ) : (
        <>
          <AssetLockProofFields onChange={setProof} />
          <AssetLockKeyField
            value={wif}
            onChange={setWif}
            hint="Platform credits the asset lock's value, less the fee, to the identity."
          />
        </>
      )}
    </VStack>
  );
}
