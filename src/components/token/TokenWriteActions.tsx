'use client';

import { useMemo } from 'react';
import { WriteActions } from '@components/broadcast/WriteActions';
import { plausibleOperations } from '@components/broadcast/tokens/checks';
import { tokenModelFromContract } from '@components/broadcast/tokens/model';
import { tokenOperationId, type TokenOperationKind } from '@components/broadcast/tokens/options';
import { useSigner } from '@/signer/SignerProvider';
import { useTokenIdentityBalances } from '@sdk/queries';

const LABELS: Record<TokenOperationKind, string> = {
  mint: 'Mint',
  burn: 'Burn',
  transfer: 'Transfer',
  freeze: 'Freeze',
  unfreeze: 'Unfreeze',
  destroyFrozen: 'Destroy frozen funds',
  emergencyAction: 'Pause / resume',
  setPrice: 'Set price',
  directPurchase: 'Buy',
  claim: 'Claim',
  configUpdate: 'Update config',
};

/**
 * Token write entry points for the connected identity (or the reconnect hint
 * read pages keep), limited to what its rules plausibly allow. The console
 * checks everything again before review and before signing.
 */
export function TokenWriteActions({
  tokenId,
  contractId,
  position,
  contract,
  forSale,
}: {
  tokenId: string;
  contractId: string;
  position: number;
  contract: unknown;
  forSale: boolean;
}) {
  const { signer, stash } = useSigner();
  const identityId = signer?.identityId ?? stash?.identityId;
  const balancesQ = useTokenIdentityBalances(identityId, identityId ? [tokenId] : undefined);
  const model = useMemo(() => {
    try {
      return tokenModelFromContract(contract, { tokenId, contractId, position });
    } catch {
      return null;
    }
  }, [contract, tokenId, contractId, position]);
  if (!identityId || !model) return null;
  const balance = balancesQ.data instanceof Map ? ((balancesQ.data.get(tokenId) as bigint | undefined) ?? 0n) : undefined;
  const kinds = plausibleOperations(model, identityId, { balance, forSale, nowMs: Date.now() });
  return (
    <WriteActions
      title="Actions"
      links={kinds.map((kind) => ({ op: tokenOperationId(kind), label: LABELS[kind], params: { token: tokenId } }))}
    />
  );
}
