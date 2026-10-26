'use client';

import { useEffect, useState } from 'react';
import { VStack } from '@chakra-ui/react';
import type { NewIdentityKeyChoice } from '@/signer/new-identity';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { AssetLockKeyField, AssetLockProofFields } from './AssetLockFields';
import { BridgeHandoff, FundingModeChoice, type FundingMode } from './BridgeHandoff';
import { NewIdentityKeysFields } from './NewIdentityKeysFields';
import type { ParsedAssetLockProof } from './asset-lock';

export interface IdentityCreateOptions {
  network: DerivationNetwork;
  proof: ParsedAssetLockProof;
  assetLockKeyWif: string;
  keys: NewIdentityKeyChoice;
}

export function IdentityCreateForm({
  network,
  onOptionsChange,
}: OperationFormProps<IdentityCreateOptions>) {
  const [mode, setMode] = useState<FundingMode>('bridge');
  const [proof, setProof] = useState<ParsedAssetLockProof | null>(null);
  const [wif, setWif] = useState('');
  const [keys, setKeys] = useState<NewIdentityKeyChoice | null>(null);

  useEffect(() => {
    if (mode !== 'proof' || !proof || !wif.trim() || !keys) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ network, proof, assetLockKeyWif: wif.trim(), keys });
  }, [mode, proof, wif, keys, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <FundingModeChoice value={mode} onChange={setMode} />
      {mode === 'bridge' ? (
        <BridgeHandoff action="create" />
      ) : (
        <>
          <AssetLockProofFields showIdentityId onChange={setProof} />
          <AssetLockKeyField
            value={wif}
            onChange={setWif}
            hint="The new identity receives the asset lock's value, less the fee."
          />
          <NewIdentityKeysFields network={network} onChange={setKeys} />
        </>
      )}
    </VStack>
  );
}
