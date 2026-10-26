import type { EvoSDK } from '@dashevo/evo-sdk';
import { describePurpose, keyMeetsCriteria } from '@/signer/keys';
import type { ExplorerSigner, KeySelectionCriteria, SignerKeyDescriptor } from '@/signer/types';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';

export interface OperationCapabilityRequirement {
  status: 'available' | 'unsupported';
  reason?: string;
  criteria?: KeySelectionCriteria;
  /**
   * Who signs: the connected identity signer (the default), or keys the form
   * collects for this operation only (address, asset-lock and voting keys, or
   * a transition that is already signed). Form-signed operations need no
   * connected signer.
   */
  signer?: 'identity' | 'form';
}

/** Whether the operation signs with keys entered in its own form. */
export function signsInForm(requirement: OperationCapabilityRequirement | undefined): boolean {
  return requirement?.signer === 'form';
}

const FORM_KEYS_REASON =
  'This operation signs with keys you enter in the form. They stay in this tab only for this operation; no connected signer is needed.';

export interface OperationCapability {
  status: 'available' | 'requires-another-signer' | 'unsupported';
  reason: string;
}

/** Capabilities describe the implemented path, before collecting or reviewing inputs. */
export function operationRequirement(id: string): OperationCapabilityRequirement {
  switch (id) {
    case 'identity.create':
    case 'identity.topUp':
    case 'addresses.transfer':
    case 'addresses.topUpIdentity':
    case 'addresses.withdraw':
    case 'addresses.fundFromAssetLock':
    case 'addresses.createIdentity':
    case 'voting.castVote':
      return { status: 'available', signer: 'form', reason: FORM_KEYS_REASON };
    case 'stateTransitions.broadcast':
      return {
        status: 'available',
        signer: 'form',
        reason:
          'The pasted transition is already signed; the explorer decodes it locally and broadcasts it unchanged. No connected signer is needed.',
      };
    case 'addresses.transferFromIdentity':
    case 'identity.creditTransfer':
      return {
        status: 'available',
        criteria: { purpose: 'TRANSFER', allowedSecurityLevels: ['CRITICAL'] },
      };
    case 'identity.creditWithdrawal':
      // TRANSFER keys withdraw to an address; OWNER keys only to the payout address.
      return {
        status: 'available',
        criteria: { purpose: ['TRANSFER', 'OWNER'], allowedSecurityLevels: ['CRITICAL'] },
      };
    case 'identity.updateKeys':
      return {
        status: 'available',
        criteria: { purpose: 'AUTHENTICATION', allowedSecurityLevels: ['MASTER'] },
      };
    case 'contract.update':
      return {
        status: 'available',
        criteria: { purpose: 'AUTHENTICATION', allowedSecurityLevels: ['CRITICAL'] },
      };
    case 'contract.register':
    case 'dpns.registerName':
      return {
        status: 'available',
        criteria: { purpose: 'AUTHENTICATION', allowedSecurityLevels: ['CRITICAL', 'HIGH'] },
      };
    case 'document.create':
    case 'document.replace':
    case 'document.delete':
    case 'document.transfer':
    case 'document.setPrice':
    case 'document.purchase':
      // Narrowed per document type by resolveSigningCriteria.
      return {
        status: 'available',
        criteria: {
          purpose: 'AUTHENTICATION',
          allowedSecurityLevels: ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'],
        },
      };
    default:
      return {
        status: 'unsupported',
        reason: 'This operation has no supported signing path in this explorer.',
      };
  }
}

type SecurityLevelName = 'MASTER' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
const SECURITY_LEVELS: SecurityLevelName[] = ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'];
const DOCUMENT_OPERATIONS = new Set([
  'document.create',
  'document.replace',
  'document.delete',
  'document.transfer',
  'document.setPrice',
  'document.purchase',
]);
export const DPNS_CONTRACT_ID = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'dpns')!.testnetId;

/**
 * Levels Platform accepts for a document batch: CRITICAL through the document
 * type's `signatureSecurityLevelRequirement` (default HIGH). The SDK returns the
 * requirement as a bigint. Batches only accept CRITICAL/HIGH/MEDIUM keys, so a
 * type that requires MASTER cannot be signed at all.
 */
export function documentSecurityLevels(requirement: unknown): SecurityLevelName[] {
  const required = typeof requirement === 'bigint' ? Number(requirement) : (requirement ?? 2);
  if (typeof required !== 'number' || !Number.isInteger(required) || required < 0 || required > 3)
    throw new Error(`Unsupported signatureSecurityLevelRequirement ${String(requirement)}.`);
  if (required === 0)
    throw new Error(
      'This document type requires MASTER keys, which Platform does not accept for document transitions.',
    );
  return SECURITY_LEVELS.slice(1, required + 1);
}

/**
 * Key requirements for one concrete operation: the declared requirement
 * narrowed by its inputs (document type security level, the contract a
 * contract-bound key may serve, withdrawal destination). Executors sign with
 * this, and the review step shows the key it selects.
 */
export async function resolveSigningCriteria(
  id: string,
  sdk: EvoSDK,
  options: unknown,
): Promise<KeySelectionCriteria | undefined> {
  const base = operationRequirement(id).criteria;
  const input = (options ?? {}) as Record<string, unknown>;
  if (DOCUMENT_OPERATIONS.has(id)) {
    const contractId = String(input.contractId ?? '');
    const documentType = String(input.documentType ?? '');
    const contract = await sdk.contracts.fetch(contractId);
    if (!contract) throw new Error(`Contract ${contractId} not found.`);
    const schema = (contract.schemas as Record<string, Record<string, unknown> | undefined>)[
      documentType
    ];
    if (!schema) throw new Error(`Contract ${contractId} has no "${documentType}" document type.`);
    return {
      ...base,
      allowedSecurityLevels: documentSecurityLevels(schema.signatureSecurityLevelRequirement),
      target: { contractId, documentType },
    };
  }
  if (id === 'dpns.registerName') {
    // Preorder and domain documents: keys bound to one DPNS document type cannot sign both.
    return { ...base, target: { contractId: DPNS_CONTRACT_ID } };
  }
  if (id === 'identity.creditWithdrawal') {
    // Platform rejects an address on owner-key withdrawals; they pay the payout address.
    return { ...base, purpose: input.toAddress === undefined ? 'OWNER' : 'TRANSFER' };
  }
  return base;
}

export function resolveOperationCapability(
  requirement: OperationCapabilityRequirement | undefined,
  signer: ExplorerSigner | null,
  keys: SignerKeyDescriptor[],
): OperationCapability {
  if (requirement && requirement.status !== 'available') {
    return {
      status: requirement.status,
      reason: requirement.reason ?? 'This operation is unavailable here.',
    };
  }
  if (signsInForm(requirement)) {
    return { status: 'available', reason: requirement?.reason ?? FORM_KEYS_REASON };
  }
  if (!signer?.prepareSdk) {
    return {
      status: 'requires-another-signer',
      reason: signer
        ? 'This signer cannot sign SDK operations. Connect a verified bridge backup, mnemonic, or WIF signer on the wallet page.'
        : 'Connect a signer on the wallet page to use this operation.',
    };
  }
  // The target contract is not known before the form is filled in.
  if (
    !keys.some((key) =>
      keyMeetsCriteria(key, requirement?.criteria, { ignoreContractBounds: true }),
    )
  ) {
    return {
      status: 'requires-another-signer',
      reason:
        `This operation needs an enabled ${describePurpose(requirement?.criteria) ?? 'eligible'} key` +
        `${requirement?.criteria?.minSecurityLevel ? ` at ${requirement.criteria.minSecurityLevel} security or stronger` : ''}` +
        `${requirement?.criteria?.allowedSecurityLevels ? ` with ${requirement.criteria.allowedSecurityLevels.join(' or ')} security` : ''}` +
        '. Connect a signer with a matching on-chain key.',
    };
  }
  return {
    status: 'available',
    reason:
      'The connected signer has an eligible on-chain key. Its current status will be checked again before signing.',
  };
}
