'use client';

import type { OperationDescriptor } from './OperationShell';
import { operationRequirement, resolveSigningCriteria, signsInForm } from './capabilities';
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
import { DpnsRegisterForm, DPNS_TLD, type DpnsRegisterOptions } from './forms/DpnsRegister';
import { IdentityCreateForm, type IdentityCreateOptions } from './forms/identity/IdentityCreate';
import { IdentityTopUpForm, type IdentityTopUpOptions } from './forms/identity/IdentityTopUp';
import {
  AddressTransferForm,
  type AddressTransferOptions,
} from './forms/addresses/AddressTransfer';
import {
  AddressTransferFromIdentityForm,
  type AddressTransferFromIdentityOptions,
} from './forms/addresses/AddressTransferFromIdentity';
import {
  AddressTopUpIdentityForm,
  type AddressTopUpIdentityOptions,
} from './forms/addresses/AddressTopUpIdentity';
import {
  AddressWithdrawForm,
  type AddressWithdrawOptions,
} from './forms/addresses/AddressWithdraw';
import {
  AddressFundFromAssetLockForm,
  type AddressFundFromAssetLockOptions,
} from './forms/addresses/AddressFundFromAssetLock';
import {
  AddressCreateIdentityForm,
  type AddressCreateIdentityOptions,
} from './forms/addresses/AddressCreateIdentity';
import { formatCredits, sumOutputs } from './forms/addresses/limits';
import { MasternodeVoteForm, type MasternodeVoteOptions } from './forms/voting/MasternodeVote';
import {
  redactAddressKey,
  redactAssetLockKey,
  redactNewIdentityKeys,
  redactVotingKey,
} from './forms/redact';
import { RawBroadcastForm, type RawBroadcastOptions } from './forms/raw/RawBroadcast';
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
  executeDpnsRegister,
  type ContractRegisterResult,
  type ContractUpdateResult,
  type DocumentResult,
  type IdentityResult,
} from './executors';
import {
  executeAddressCreateIdentity,
  executeAddressFundFromAssetLock,
  executeAddressTopUpIdentity,
  executeAddressTransfer,
  executeAddressTransferFromIdentity,
  executeAddressWithdraw,
  type AddressesResult,
} from './executors/addresses';
import { executeIdentityCreate, executeIdentityTopUp } from './executors/identity-create';
import { executeMasternodeVote, type VoteResult } from './executors/voting';
import { executeRawBroadcast, type RawBroadcastResult } from './executors/raw';

export type OperationGroup =
  | 'identity'
  | 'addresses'
  | 'contract'
  | 'document'
  | 'dpns'
  | 'voting'
  | 'advanced';

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
  const capability = operationRequirement(id);
  return {
    id,
    group,
    label,
    blurb,
    descriptor: {
      ...descriptor,
      operationId: id,
      capability,
      // Form-signed operations have no connected-signer key to select.
      ...(signsInForm(capability)
        ? {}
        : { signingCriteria: (sdk, options) => resolveSigningCriteria(id, sdk, options) }),
    } as OperationDescriptor<unknown, unknown>,
  };
}

const ADDRESS_FEE_NOTE =
  "the paying address covers Platform's fee from the balance it keeps after this operation.";
const ASSET_LOCK_FEE_NOTE = "Platform takes its fee from the asset lock's value.";

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
  makeEntry<IdentityCreateOptions, IdentityResult>(
    'identity',
    'identity.create',
    'Create an identity',
    'Fund a new identity with a Dash asset lock, or through the bridge.',
    {
      title: 'Create an identity',
      description:
        'Creates an identity funded by an asset-lock transaction from a Core wallet. Without a ' +
        'Core wallet, use the bridge, which builds the asset lock for you.',
      secrets: { reviewData: (o) => redactNewIdentityKeys(redactAssetLockKey(o)) },
      feeNote: ASSET_LOCK_FEE_NOTE,
      FormComponent: IdentityCreateForm,
      summarise: (o) =>
        `Create identity ${o.proof.identityId} from the ${o.proof.type} asset lock ${o.proof.outPoint}.`,
      execute: executeIdentityCreate,
    },
  ),
  makeEntry<IdentityTopUpOptions, IdentityResult>(
    'identity',
    'identity.topUp',
    'Top up an identity',
    'Add credits with a Dash asset lock, or through the bridge.',
    {
      title: 'Top up an identity',
      description:
        'Adds credits from an asset-lock transaction from a Core wallet. Without a Core wallet, ' +
        'use the bridge, which builds the asset lock for you.',
      secrets: { reviewData: redactAssetLockKey },
      feeNote: ASSET_LOCK_FEE_NOTE,
      FormComponent: IdentityTopUpForm,
      summarise: (o) =>
        `Top up ${o.identityId} from the ${o.proof.type} asset lock ${o.proof.outPoint}.`,
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
  // Platform addresses
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<AddressTransferOptions, AddressesResult>(
    'addresses',
    'addresses.transfer',
    'Send between addresses',
    'Move credits from a Platform address you hold the key for to other addresses.',
    {
      title: 'Send credits between Platform addresses',
      description:
        "Spends credits from a Platform address, signed with that address's private key, to one " +
        'or more Platform addresses.',
      secrets: { reviewData: redactAddressKey },
      feeNote:
        "the paying address covers Platform's fee from the balance it keeps, unless you chose that the recipient pays it.",
      FormComponent: AddressTransferForm,
      summarise: (o) =>
        `Send ${formatCredits(sumOutputs(o.outputs))} credits from ${o.fromAddress} to ` +
        `${o.outputs.length} address(es); ${o.feeFrom === 'recipient' ? 'the recipient' : 'the sender'} pays the fee.`,
      execute: executeAddressTransfer,
    },
  ),
  makeEntry<AddressTransferFromIdentityOptions, AddressesResult>(
    'addresses',
    'addresses.transferFromIdentity',
    'Fund addresses from your identity',
    'Send credits from the connected identity to Platform addresses.',
    {
      title: 'Fund Platform addresses from your identity',
      description:
        "Sends credits from the connected identity to Platform addresses, signed with the identity's CRITICAL transfer key.",
      secrets: 'none',
      FormComponent: AddressTransferFromIdentityForm,
      summarise: (o) =>
        `Send ${formatCredits(sumOutputs(o.outputs))} credits to ${o.outputs.length} address(es).`,
      execute: executeAddressTransferFromIdentity,
    },
  ),
  makeEntry<AddressTopUpIdentityOptions, AddressesResult>(
    'addresses',
    'addresses.topUpIdentity',
    'Top up an identity from an address',
    'Move credits from a Platform address into an identity.',
    {
      title: 'Top up an identity from a Platform address',
      description:
        "Moves credits from a Platform address, signed with the address's key, into an identity.",
      secrets: { reviewData: redactAddressKey },
      feeNote: ADDRESS_FEE_NOTE,
      FormComponent: AddressTopUpIdentityForm,
      summarise: (o) =>
        `Top up ${o.identityId} with ${formatCredits(o.amountCredits)} credits from ${o.fromAddress}.`,
      execute: executeAddressTopUpIdentity,
    },
  ),
  makeEntry<AddressWithdrawOptions, AddressesResult>(
    'addresses',
    'addresses.withdraw',
    'Withdraw from an address',
    'Convert Platform address credits to DASH at a Core address.',
    {
      title: 'Withdraw from a Platform address',
      description:
        'Withdraws credits from a Platform address to a Dash Core address. Platform queues the ' +
        'withdrawal and pays it as a Core transaction later.',
      secrets: { reviewData: redactAddressKey },
      feeNote: ADDRESS_FEE_NOTE,
      FormComponent: AddressWithdrawForm,
      summarise: (o) =>
        `Withdraw ${formatCredits(o.amountCredits)} credits from ${o.fromAddress} to ${o.toAddress} ` +
        `at ${o.coreFeePerByte} duff(s)/byte.`,
      execute: executeAddressWithdraw,
    },
  ),
  makeEntry<AddressFundFromAssetLockOptions, AddressesResult>(
    'addresses',
    'addresses.fundFromAssetLock',
    'Fund an address from an asset lock',
    'Credit a Platform address with a Dash asset lock from a Core wallet.',
    {
      title: 'Fund a Platform address from an asset lock',
      description:
        'Credits the whole value of an asset-lock transaction from a Core wallet to a Platform address.',
      secrets: { reviewData: redactAssetLockKey },
      feeNote: ASSET_LOCK_FEE_NOTE,
      FormComponent: AddressFundFromAssetLockForm,
      summarise: (o) =>
        `Fund ${o.address} from the ${o.proof.type} asset lock ${o.proof.outPoint}.`,
      execute: executeAddressFundFromAssetLock,
    },
  ),
  makeEntry<AddressCreateIdentityOptions, AddressesResult>(
    'addresses',
    'addresses.createIdentity',
    'Create an identity from an address',
    'Fund a new identity with Platform address credits.',
    {
      title: 'Create an identity from a Platform address',
      description:
        "Creates an identity funded by a Platform address, signed with the address's key and the new identity's keys.",
      secrets: { reviewData: (o) => redactNewIdentityKeys(redactAddressKey(o)) },
      feeNote: ADDRESS_FEE_NOTE,
      FormComponent: AddressCreateIdentityForm,
      summarise: (o) =>
        `Create an identity with ${formatCredits(o.amountCredits)} credits from ${o.fromAddress}.`,
      execute: executeAddressCreateIdentity,
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
  makeEntry<MasternodeVoteOptions, VoteResult>(
    'voting',
    'voting.castVote',
    'Cast a masternode vote',
    'Vote on a contested DPNS name or contract resource with a masternode voting key.',
    {
      title: 'Cast a masternode vote',
      description:
        "Casts a masternode's vote on a contested resource, such as a contested DPNS name. It " +
        "needs the masternode's ProTxHash and voting key.",
      secrets: { reviewData: redactVotingKey },
      feeNote: "votes are paid from the contest's prefunded balance, not by the masternode.",
      FormComponent: MasternodeVoteForm,
      summarise: (o) =>
        `Vote ${o.choice === 'towardsIdentity' ? `for ${o.towardsIdentityId}` : o.choice} on ` +
        `${o.documentTypeName} ${JSON.stringify(o.indexValues)} as masternode ${o.proTxHash}.`,
      execute: executeMasternodeVote,
    },
  ),

  // ────────────────────────────────────────────────────────────────────────
  // Advanced
  // ────────────────────────────────────────────────────────────────────────
  makeEntry<RawBroadcastOptions, RawBroadcastResult>(
    'advanced',
    'stateTransitions.broadcast',
    'Broadcast a signed state transition',
    'Paste a transition signed by another tool, check it, and broadcast it.',
    {
      title: 'Broadcast a signed state transition',
      description:
        'Decodes a signed transition (hex or base64) locally, shows what it does, and broadcasts ' +
        'the same bytes. Most users want the named operations above instead.',
      secrets: 'none',
      feeNote:
        "the transition's owner (or its address inputs) pays the fee it was signed for; broadcasting cannot change it.",
      FormComponent: RawBroadcastForm,
      summarise: (o) =>
        `Broadcast the ${o.transition.type} transition ${o.transition.hash}` +
        `${o.transition.ownerId ? ` owned by ${o.transition.ownerId}` : ''}.`,
      execute: executeRawBroadcast,
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
    blurb: 'Create, top up, transfer credits, withdraw to L1, manage keys.',
  },
  {
    id: 'addresses',
    label: 'Platform addresses',
    blurb: 'Send, fund, withdraw, and create identities with address credits.',
  },
  { id: 'dpns', label: 'DPNS', blurb: 'Register and manage names.' },
  { id: 'voting', label: 'Voting', blurb: 'Masternode votes on contested resources.' },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Broadcast a transition signed elsewhere.',
  },
];

/** Picker marker: who signs, or that the operation cannot be signed here. */
export function operationStatusLabel(entry: OperationEntry): 'Keys in form' | 'Unavailable' | null {
  const capability = entry.descriptor.capability;
  if (capability?.status === 'unsupported') return 'Unavailable';
  return signsInForm(capability) ? 'Keys in form' : null;
}

export function findOperationById(id: string | null | undefined): OperationEntry | undefined {
  if (!id) return undefined;
  return OPERATIONS.find((o) => o.id === id);
}

export function operationsInGroup(group: OperationGroup): OperationEntry[] {
  return OPERATIONS.filter((o) => o.group === group);
}
