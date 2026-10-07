import { keyMeetsCriteria } from '@/signer/keys';
import type { ExplorerSigner, KeySelectionCriteria, SignerKeyDescriptor } from '@/signer/types';

export interface OperationCapabilityRequirement {
  status: 'available' | 'external-bridge' | 'unsupported';
  reason?: string;
  criteria?: KeySelectionCriteria;
}

export interface OperationCapability {
  status: 'available' | 'requires-another-signer' | 'external-bridge' | 'unsupported';
  reason: string;
}

/** Capabilities describe the implemented path, before collecting or reviewing inputs. */
export function operationRequirement(id: string): OperationCapabilityRequirement {
  switch (id) {
    case 'identity.topUp':
      return {
        status: 'external-bridge',
        reason:
          'Top-ups run in the Dash Platform bridge, which creates the required Dash asset-lock transaction. Open the bridge to continue.',
      };
    case 'stateTransitions.broadcast':
      return {
        status: 'unsupported',
        reason:
          'Raw state-transition broadcasting is unavailable in this explorer. Use the tool that produced the signed transition to broadcast it.',
      };
    case 'voting.castVote':
      return {
        status: 'unsupported',
        reason:
          'Masternode vote broadcasting is unavailable in this explorer. Use a masternode voting tool.',
      };
    case 'identity.creditTransfer':
    case 'identity.creditWithdrawal':
      return {
        status: 'available',
        criteria: { purpose: 'TRANSFER', allowedSecurityLevels: ['CRITICAL'] },
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
    case 'document.create':
    case 'document.replace':
    case 'document.delete':
    case 'document.transfer':
    case 'document.setPrice':
    case 'document.purchase':
    case 'dpns.registerName':
      return {
        status: 'available',
        criteria: { purpose: 'AUTHENTICATION', allowedSecurityLevels: ['CRITICAL', 'HIGH'] },
      };
    default:
      return {
        status: 'unsupported',
        reason: 'This operation has no supported signing path in this explorer.',
      };
  }
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
  if (!signer?.prepareSdk) {
    return {
      status: 'requires-another-signer',
      reason: signer
        ? 'This signer cannot sign SDK operations. Connect a verified bridge backup, mnemonic, or WIF signer on the wallet page.'
        : 'Connect a signer on the wallet page to use this operation.',
    };
  }
  if (!keys.some((key) => keyMeetsCriteria(key, requirement?.criteria))) {
    return {
      status: 'requires-another-signer',
      reason:
        `This operation needs an enabled ${requirement?.criteria?.purpose ?? 'eligible'} key` +
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
