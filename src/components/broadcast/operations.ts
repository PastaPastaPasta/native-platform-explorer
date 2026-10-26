'use client';

import type { OperationDescriptor } from './OperationShell';
import { operationRequirement, resolveSigningCriteria } from './capabilities';
import { ContractRegisterForm, type ContractRegisterOptions } from './forms/ContractRegister';
import { ContractUpdateForm, type ContractUpdateOptions } from './forms/ContractUpdate';
import { DocumentCreateForm, type DocumentCreateOptions } from './forms/DocumentCreate';
import { DocumentReplaceForm, type DocumentReplaceOptions } from './forms/DocumentReplace';
import { DocumentDeleteForm, type DocumentDeleteOptions } from './forms/DocumentDelete';
import { DocumentTransferForm, type DocumentTransferOptions } from './forms/DocumentTransfer';
import { DocumentSetPriceForm, type DocumentSetPriceOptions } from './forms/DocumentSetPrice';
import { DocumentPurchaseForm, type DocumentPurchaseOptions } from './forms/DocumentPurchase';
import {
  IdentityCreditTransferForm,
  type IdentityCreditTransferOptions,
} from './forms/IdentityCreditTransfer';
import {
  IdentityCreditWithdrawalForm,
  type IdentityCreditWithdrawalOptions,
} from './forms/IdentityCreditWithdrawal';
import {
  IdentityUpdateKeysForm,
  redactIdentityUpdateKeys,
  type IdentityUpdateKeysOptions,
} from './forms/IdentityUpdateKeys';
import { IdentityTopUpForm, type IdentityTopUpOptions } from './forms/IdentityTopUp';
import { DpnsRegisterForm, DPNS_TLD, type DpnsRegisterOptions } from './forms/DpnsRegister';
import { VotingCastVoteForm, type VotingCastVoteOptions } from './forms/VotingCastVote';
import { StateTransitionBroadcastForm, type RawBroadcastOptions } from './forms/RawBroadcast';
import {
  executeContractRegister,
  executeContractUpdate,
  executeDocumentCreate,
  executeDocumentReplace,
  executeDocumentDelete,
  executeDocumentTransfer,
  executeDocumentSetPrice,
  executeDocumentPurchase,
  executeIdentityCreditTransfer,
  executeIdentityCreditWithdrawal,
  executeIdentityUpdateKeys,
  executeIdentityTopUp,
  executeDpnsRegister,
  executeVotingCastVote,
  type ContractRegisterResult,
  type ContractUpdateResult,
  type DocumentResult,
  type IdentityResult,
} from './executors';

export type OperationGroup = 'identity' | 'contract' | 'document' | 'dpns' | 'voting' | 'advanced';

export interface OperationEntry {
  /** Stable op id used in URLs (e.g. "contract.register"). */
  id: string;
  /** Group used for navigation grouping in /broadcast. */
  group: OperationGroup;
  /** Plain-English label shown in the picker (not the SDK method name). */
  label: string;
  /** One-line description shown beneath the label. */
  blurb: string;
  descriptor: OperationDescriptor<unknown, unknown>;
}

function makeEntry<O, R>(
  group: OperationGroup,
  id: string,
  label: string,
  blurb: string,
  descriptor: OperationDescriptor<O, R>,
): OperationEntry {
  return {
    id,
    group,
    label,
    blurb,
    descriptor: {
      ...descriptor,
      operationId: id,
      capability: operationRequirement(id),
      signingCriteria: (sdk, options) => resolveSigningCriteria(id, sdk, options),
    } as OperationDescriptor<unknown, unknown>,
  };
}

function previewOnly(operation: string): never {
  throw new Error(
    `${operation} is preview-only in this build: paste a hex-encoded state ` +
      `transition obtained from another tool. The end-to-end SDK path for raw ` +
      `byte broadcast is tracked as follow-up work.`,
  );
}

export const OPERATIONS: OperationEntry[] = [
  // ────────────────────────────────────────────────────────────────────────
  // Contracts
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<ContractRegisterOptions, ContractRegisterResult>(
    'contract',
    'contract.register',
    'Register a data contract',
    'Publish a new data contract owned by your identity.',
    {
      title: 'Register a data contract',
      description:
        'Publish a new data contract. The schemas you define here will determine ' +
        'what documents can be created on this contract later.',
      secrets: 'none',
      FormComponent: ContractRegisterForm,
      summarise: (o) =>
        `Register a contract with ${Object.keys(o.documentSchemas ?? {}).length} ` +
        `document type(s) owned by ${o.ownerId}.`,
      execute: executeContractRegister,
    },
  ),
  makeEntry<ContractUpdateOptions, ContractUpdateResult>(
    'contract',
    'contract.update',
    'Update a data contract',
    'Edit the document schemas and definitions of a contract you own.',
    {
      title: 'Update a data contract',
      description:
        'Replaces the document schemas and schema definitions of a contract you own and ' +
        'publishes it as the next version. Groups, tokens, and config are not changed.',
      secrets: 'none',
      FormComponent: ContractUpdateForm,
      summarise: (o) =>
        o.baseVersion === undefined
          ? `Update contract ${o.contractId}.`
          : `Update contract ${o.contractId} from version ${o.baseVersion} to ${o.baseVersion + 1}.`,
      execute: executeContractUpdate,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // Documents
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<DocumentCreateOptions, DocumentResult>(
    'document',
    'document.create',
    'Create a document',
    'Add a new document to a data contract.',
    {
      title: 'Create a document',
      description:
        'Pick a contract and a document type, fill in the fields, sign, and ' + 'broadcast.',
      secrets: 'none',
      FormComponent: DocumentCreateForm,
      summarise: (o) => `Create a "${o.documentType}" document on contract ${o.contractId}.`,
      execute: executeDocumentCreate,
    },
  ),
  makeEntry<DocumentReplaceOptions, DocumentResult>(
    'document',
    'document.replace',
    'Edit a document',
    'Replace the fields of a document you own.',
    {
      title: 'Edit a document',
      description:
        'Loads the current document and lets you change its fields. The revision ' +
        'is bumped automatically.',
      secrets: 'none',
      FormComponent: DocumentReplaceForm,
      summarise: (o) => `Replace document ${o.documentId} on contract ${o.contractId}.`,
      execute: executeDocumentReplace,
    },
  ),
  makeEntry<DocumentDeleteOptions, DocumentResult>(
    'document',
    'document.delete',
    'Delete a document',
    'Permanently remove a document you own.',
    {
      title: 'Delete a document',
      description: 'Removes a document. This is permanent.',
      destructive: true,
      secrets: 'none',
      FormComponent: DocumentDeleteForm,
      summarise: (o) => `Delete document ${o.documentId} on contract ${o.contractId}.`,
      execute: executeDocumentDelete,
    },
  ),
  makeEntry<DocumentTransferOptions, DocumentResult>(
    'document',
    'document.transfer',
    'Transfer a document',
    'Hand off ownership of a document to another identity.',
    {
      title: 'Transfer a document',
      description:
        'Changes the owner of a document to another identity. The recipient ' +
        'becomes responsible for the document going forward.',
      secrets: 'none',
      FormComponent: DocumentTransferForm,
      summarise: (o) => `Transfer document ${o.documentId} to ${o.recipientId}.`,
      execute: executeDocumentTransfer,
    },
  ),
  makeEntry<DocumentSetPriceOptions, DocumentResult>(
    'document',
    'document.setPrice',
    'Set a document price',
    'List a document for sale, or remove an existing price.',
    {
      title: 'Set a document price',
      description:
        'Marks a document as for-sale at a given credit price. Set the price to 0 ' +
        'to remove the listing.',
      secrets: 'none',
      FormComponent: DocumentSetPriceForm,
      summarise: (o) => `Set price on document ${o.documentId} to ${o.priceCredits} credits.`,
      execute: executeDocumentSetPrice,
    },
  ),
  makeEntry<DocumentPurchaseOptions, DocumentResult>(
    'document',
    'document.purchase',
    'Purchase a document',
    'Buy a listed document; ownership transfers to you.',
    {
      title: 'Purchase a document',
      description:
        'Buys a document that has been listed for sale. The credits leave your ' +
        'identity and ownership transfers to you.',
      secrets: 'none',
      FormComponent: DocumentPurchaseForm,
      summarise: (o) => `Purchase document ${o.documentId} for ${o.priceCredits} credits.`,
      execute: executeDocumentPurchase,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // Identity
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<IdentityTopUpOptions, unknown>(
    'identity',
    'identity.topUp',
    'Top up an identity',
    'Add Platform credits by spending L1 DASH through the bridge.',
    {
      title: 'Top up an identity',
      description:
        'Top-up requires an asset-lock proof built from a Dash Core transaction. ' +
        'For now we hand off to the bridge — return to the explorer when the ' +
        'top-up completes, then refresh the identity page to check the balance.',
      secrets: 'none',
      FormComponent: IdentityTopUpForm,
      summarise: (o) => `Top up ${o.identityId} by ${o.amountDash} DASH (via bridge).`,
      execute: executeIdentityTopUp,
    },
  ),
  makeEntry<IdentityCreditTransferOptions, IdentityResult>(
    'identity',
    'identity.creditTransfer',
    'Transfer credits',
    'Move credits from your identity to another identity.',
    {
      title: 'Transfer credits',
      description:
        'Sends credits from your identity to another. The recipient must already ' +
        'exist on Platform.',
      secrets: 'none',
      FormComponent: IdentityCreditTransferForm,
      summarise: (o) => `Transfer ${o.amountCredits} credits to ${o.recipientId}.`,
      execute: executeIdentityCreditTransfer,
    },
  ),
  makeEntry<IdentityCreditWithdrawalOptions, IdentityResult>(
    'identity',
    'identity.creditWithdrawal',
    'Withdraw credits',
    'Convert credits back to L1 DASH at a Core address.',
    {
      title: 'Withdraw credits',
      description:
        'Withdraws credits to a Dash Core address, or a masternode owner identity to its ' +
        'payout address. The withdrawal is queued on Platform and settles as a Core transaction.',
      secrets: 'none',
      FormComponent: IdentityCreditWithdrawalForm,
      summarise: (o) =>
        `Withdraw ${o.amountCredits} credits to ${o.toAddress ?? 'the masternode payout address'} ` +
        `at ${o.coreFeePerByte} duff(s)/byte.`,
      execute: executeIdentityCreditWithdrawal,
    },
  ),
  makeEntry<IdentityUpdateKeysOptions, IdentityResult>(
    'identity',
    'identity.updateKeys',
    'Update identity keys',
    'Add new public keys or disable existing ones.',
    {
      title: 'Update identity keys',
      description:
        'Adds new public keys to your identity and/or disables existing key IDs. ' +
        'Master, critical-auth, and transfer keys cannot be disabled.',
      destructive: true,
      FormComponent: IdentityUpdateKeysForm,
      summarise: (o) => {
        const adds = o.addKeys?.length ? `add ${o.addKeys.length} key(s)` : '';
        const disables = o.disableKeyIds?.length ? `disable ${o.disableKeyIds.length} key(s)` : '';
        return [adds, disables].filter(Boolean).join(', ') || 'no-op';
      },
      // The new keys' private keys sign their proofs of possession.
      secrets: { reviewData: redactIdentityUpdateKeys },
      execute: executeIdentityUpdateKeys,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // DPNS
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<DpnsRegisterOptions, IdentityResult>(
    'dpns',
    'dpns.registerName',
    'Register a DPNS name',
    'Claim a human-readable name for your identity.',
    {
      title: 'Register a DPNS name',
      description:
        'Registers a .dash name for the connected identity (a preorder followed by the ' +
        'domain document). Short names made of letters, 0, 1, and hyphens are contested and ' +
        'are decided by a masternode vote.',
      secrets: 'none',
      FormComponent: DpnsRegisterForm,
      summarise: (o) =>
        o.contested
          ? `Open a contested registration for ${o.label}.${DPNS_TLD} (0.2 DASH contest fee plus normal fees; masternodes vote on the winner).`
          : `Register ${o.label}.${DPNS_TLD} for the connected identity.`,
      execute: executeDpnsRegister,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // Voting
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<VotingCastVoteOptions, IdentityResult>(
    'voting',
    'voting.castVote',
    'Cast a vote',
    'Vote on a contested DPNS or contract resource (masternodes only).',
    {
      title: 'Cast a vote',
      description:
        'Casts a masternode vote on a contested resource (e.g. a contested DPNS ' +
        'name). Only operating masternodes have a voting key.',
      secrets: 'none',
      FormComponent: VotingCastVoteForm,
      summarise: (o) => `Vote ${o.choice}${o.targetIdentityId ? ` → ${o.targetIdentityId}` : ''}.`,
      execute: executeVotingCastVote,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // Advanced
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<RawBroadcastOptions, unknown>(
    'advanced',
    'stateTransitions.broadcast',
    'Broadcast a raw state transition',
    'Paste a hex-encoded state transition produced elsewhere.',
    {
      title: 'Broadcast a raw state transition',
      description:
        'Paste a hex-encoded state transition. Use only if you have a hex blob ' +
        'from another tool — most users want the named operations above instead.',
      secrets: 'none',
      FormComponent: StateTransitionBroadcastForm,
      summarise: (o) => `Broadcast ${o.stHex.length / 2} bytes of raw state transition.`,
      execute: async () => previewOnly('stateTransitions.broadcastStateTransition'),
    },
  ),
];

export const GROUPS: { id: OperationGroup; label: string; blurb: string }[] = [
  {
    id: 'contract',
    label: 'Contracts',
    blurb: 'Register and update data contracts.',
  },
  {
    id: 'document',
    label: 'Documents',
    blurb: 'Create, edit, transfer, sell, and buy documents.',
  },
  {
    id: 'identity',
    label: 'Identity & credits',
    blurb: 'Top up, transfer credits, withdraw to L1, manage keys.',
  },
  { id: 'dpns', label: 'DPNS', blurb: 'Register and manage names.' },
  { id: 'voting', label: 'Voting', blurb: 'Masternode votes on contested resources.' },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Low-level tools — raw broadcast, etc.',
  },
];

/** Picker marker for operations that cannot be signed here, or null when they can. */
export function operationStatusLabel(entry: OperationEntry): 'Bridge' | 'Unavailable' | null {
  const status = entry.descriptor.capability?.status;
  return status === 'external-bridge' ? 'Bridge' : status === 'unsupported' ? 'Unavailable' : null;
}

export function findOperationById(id: string | null | undefined): OperationEntry | undefined {
  if (!id) return undefined;
  return OPERATIONS.find((o) => o.id === id);
}

export function operationsInGroup(group: OperationGroup): OperationEntry[] {
  return OPERATIONS.filter((o) => o.group === group);
}
