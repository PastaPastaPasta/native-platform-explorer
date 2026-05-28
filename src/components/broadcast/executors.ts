// All SDK execution logic for the write operations lives here. Form components
// only collect input; the executors take EvoSDK + ExplorerSigner + form options
// and return a result the OperationShell renders.

import {
  DataContract,
  Document,
  IdentityPublicKeyInCreation,
} from '@dashevo/evo-sdk';
import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner, KeySelectionCriteria } from '@/signer/types';
import type { ContractRegisterOptions } from './forms/ContractRegister';
import type { ContractUpdateOptions } from './forms/ContractUpdate';
import type { DocumentCreateOptions } from './forms/DocumentCreate';
import type { DocumentReplaceOptions } from './forms/DocumentReplace';
import type { DocumentDeleteOptions } from './forms/DocumentDelete';
import type { DocumentTransferOptions } from './forms/DocumentTransfer';
import type { DocumentSetPriceOptions } from './forms/DocumentSetPrice';
import type { DocumentPurchaseOptions } from './forms/DocumentPurchase';
import type { IdentityCreditTransferOptions } from './forms/IdentityCreditTransfer';
import type { IdentityCreditWithdrawalOptions } from './forms/IdentityCreditWithdrawal';
import type { IdentityUpdateKeysOptions } from './forms/IdentityUpdateKeys';
import type { IdentityTopUpOptions } from './forms/IdentityTopUp';
import type { DpnsRegisterOptions } from './forms/DpnsRegister';
import type { VotingCastVoteOptions } from './forms/VotingCastVote';

export interface ContractRegisterResult {
  kind: 'contractRegister';
  contractId: string;
  ownerId: string;
  version: number;
  documentTypes: string[];
}

export interface ContractUpdateResult {
  kind: 'contractUpdate';
  contractId: string;
  newVersion?: number;
}

export interface DocumentResult {
  kind: 'document';
  contractId: string;
  documentType: string;
  documentId: string;
  ownerId: string;
  action: 'create' | 'replace' | 'delete' | 'transfer' | 'setPrice' | 'purchase';
}

export interface IdentityResult {
  kind: 'identity';
  identityId: string;
  message: string;
  newBalance?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────

async function prepareSigning(
  signer: ExplorerSigner,
  criteria?: KeySelectionCriteria,
) {
  if (!signer.prepareSdk) {
    throw new Error(
      `The "${signer.kind}" signer does not support SDK signing yet. ` +
        'Connect via the Bridge backup tab on /wallet to enable writes.',
    );
  }
  return signer.prepareSdk(criteria);
}

async function getPlatformVersion(sdk: EvoSDK): Promise<number> {
  return sdk.version();
}

// ─── contracts ───────────────────────────────────────────────────────────

export async function executeContractRegister(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: ContractRegisterOptions;
}): Promise<ContractRegisterResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const platformVersion = await getPlatformVersion(sdk);
  const identityNonce =
    (await sdk.identities.nonce(material.identityId)) ?? 0n;

  const dataContract = new DataContract({
    ownerId: material.identityId,
    identityNonce: identityNonce + 1n,
    schemas: options.documentSchemas as Record<string, object>,
    definitions: options.definitions ?? undefined,
    fullValidation: true,
    platformVersion,
  });

  const published = await sdk.contracts.publish({
    dataContract,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  const docSchemas =
    (published.schemas as Record<string, unknown> | undefined) ?? {};

  return {
    kind: 'contractRegister',
    contractId: String(published.id),
    ownerId: String(published.ownerId),
    version: published.version,
    documentTypes: Object.keys(docSchemas),
  };
}

export async function executeContractUpdate(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: ContractUpdateOptions;
}): Promise<ContractUpdateResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });
  const platformVersion = await getPlatformVersion(sdk);

  const current = await sdk.contracts.fetch(options.contractId);
  if (!current) throw new Error(`Contract ${options.contractId} not found.`);
  if (String(current.ownerId) !== material.identityId) {
    throw new Error(
      `You are signed in as ${material.identityId} but the contract is owned by ${String(
        current.ownerId,
      )}.`,
    );
  }

  current.setSchemas(
    options.documentSchemas as Record<string, object>,
    options.definitions ?? null,
    true,
    platformVersion,
  );

  await sdk.contracts.update({
    dataContract: current,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'contractUpdate',
    contractId: options.contractId,
    newVersion: current.version,
  };
}

// ─── documents ──────────────────────────────────────────────────────────

async function buildDocument(
  sdk: EvoSDK,
  contractId: string,
  documentType: string,
  ownerId: string,
  properties: Record<string, unknown>,
  documentId?: string,
  revision?: bigint,
): Promise<Document> {
  const platformVersion = await getPlatformVersion(sdk);
  void platformVersion;
  return new Document({
    properties,
    documentTypeName: documentType,
    dataContractId: contractId,
    ownerId,
    id: documentId,
    revision: revision ?? 1n,
  });
}

export async function executeDocumentCreate(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentCreateOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const document = await buildDocument(
    sdk,
    options.contractId,
    options.documentType,
    material.identityId,
    options.properties,
  );

  await sdk.documents.create({
    document,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'document',
    action: 'create',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: String(document.id),
    ownerId: material.identityId,
  };
}

export async function executeDocumentReplace(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentReplaceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const document = await buildDocument(
    sdk,
    options.contractId,
    options.documentType,
    material.identityId,
    options.properties,
    options.documentId,
    options.currentRevision + 1n,
  );

  await sdk.documents.replace({
    document,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'document',
    action: 'replace',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: options.documentId,
    ownerId: material.identityId,
  };
}

export async function executeDocumentDelete(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentDeleteOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  await sdk.documents.delete({
    document: {
      id: options.documentId,
      ownerId: material.identityId,
      dataContractId: options.contractId,
      documentTypeName: options.documentType,
    },
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'document',
    action: 'delete',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: options.documentId,
    ownerId: material.identityId,
  };
}

export async function executeDocumentTransfer(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentTransferOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const existing = await sdk.documents.get(
    options.contractId,
    options.documentType,
    options.documentId,
  );
  if (!existing) throw new Error(`Document ${options.documentId} not found.`);

  await sdk.documents.transfer({
    document: existing,
    recipientId: options.recipientId as unknown as Parameters<
      typeof sdk.documents.transfer
    >[0]['recipientId'],
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'document',
    action: 'transfer',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: options.documentId,
    ownerId: material.identityId,
  };
}

export async function executeDocumentSetPrice(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentSetPriceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const existing = await sdk.documents.get(
    options.contractId,
    options.documentType,
    options.documentId,
  );
  if (!existing) throw new Error(`Document ${options.documentId} not found.`);

  await sdk.documents.setPrice({
    document: existing,
    price: options.priceCredits,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'document',
    action: 'setPrice',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: options.documentId,
    ownerId: material.identityId,
  };
}

export async function executeDocumentPurchase(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentPurchaseOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const existing = await sdk.documents.get(
    options.contractId,
    options.documentType,
    options.documentId,
  );
  if (!existing) throw new Error(`Document ${options.documentId} not found.`);

  await sdk.documents.purchase({
    document: existing,
    buyerId: material.identityKey.toJSON().contractBounds as unknown as Parameters<
      typeof sdk.documents.purchase
    >[0]['buyerId'],
    price: options.priceCredits,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  } as Parameters<typeof sdk.documents.purchase>[0]);

  return {
    kind: 'document',
    action: 'purchase',
    contractId: options.contractId,
    documentType: options.documentType,
    documentId: options.documentId,
    ownerId: material.identityId,
  };
}

// ─── identity ───────────────────────────────────────────────────────────

export async function executeIdentityCreditTransfer(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityCreditTransferOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, { purpose: 'TRANSFER' });

  const identity = await sdk.identities.fetch(material.identityId);
  if (!identity) throw new Error(`Identity ${material.identityId} not found.`);

  const result = (await sdk.identities.creditTransfer({
    identity,
    recipientId: options.recipientId,
    amount: options.amountCredits,
    signer: material.identitySigner,
    signingKey: material.identityKey,
  } as unknown as Parameters<typeof sdk.identities.creditTransfer>[0])) as unknown as {
    senderBalance?: bigint;
    recipientBalance?: bigint;
  };

  return {
    kind: 'identity',
    identityId: material.identityId,
    message: `Transferred ${options.amountCredits} credits to ${options.recipientId}.`,
    newBalance: result?.senderBalance ? String(result.senderBalance) : undefined,
  };
}

export async function executeIdentityCreditWithdrawal(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityCreditWithdrawalOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, { purpose: 'TRANSFER' });

  const identity = await sdk.identities.fetch(material.identityId);
  if (!identity) throw new Error(`Identity ${material.identityId} not found.`);

  const newBalance = await sdk.identities.creditWithdrawal({
    identity,
    amount: options.amountCredits,
    toAddress: options.toAddress,
    coreFeePerByte: options.coreFeePerByte,
    signer: material.identitySigner,
    signingKey: material.identityKey,
  } as unknown as Parameters<typeof sdk.identities.creditWithdrawal>[0]);

  return {
    kind: 'identity',
    identityId: material.identityId,
    message: `Withdrew ${options.amountCredits} credits to ${options.toAddress}.`,
    newBalance: String(newBalance),
  };
}

export async function executeIdentityUpdateKeys(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityUpdateKeysOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'MASTER',
  });

  const identity = await sdk.identities.fetch(material.identityId);
  if (!identity) throw new Error(`Identity ${material.identityId} not found.`);

  const addPublicKeys: IdentityPublicKeyInCreation[] | undefined =
    options.addPublicKeysJson && options.addPublicKeysJson.length > 0
      ? options.addPublicKeysJson.map((js) =>
          IdentityPublicKeyInCreation.fromJSON(
            js as unknown as Parameters<typeof IdentityPublicKeyInCreation.fromJSON>[0],
          ),
        )
      : undefined;

  await sdk.identities.update({
    identity,
    addPublicKeys,
    disablePublicKeys:
      options.disableKeyIds && options.disableKeyIds.length > 0
        ? options.disableKeyIds
        : undefined,
    signer: material.identitySigner,
  });

  return {
    kind: 'identity',
    identityId: material.identityId,
    message: 'Identity keys updated.',
  };
}

export async function executeIdentityTopUp(_args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityTopUpOptions;
}): Promise<IdentityResult> {
  // Top-up requires an asset-lock proof, which is built end-to-end inside the
  // bridge (Core wallet UTXO → Type-8 special tx → InstantSend proof). We
  // intentionally don't replicate that flow in the explorer; the form deep-
  // links the user to the bridge instead. This executor only ever runs if the
  // user clicks "Broadcast" past the deep-link CTA.
  throw new Error(
    'Top-up runs in the Dash Platform bridge — click "Open bridge" on the form ' +
      'instead. When the bridge completes the top-up, return to the explorer ' +
      'and the balance will refresh automatically.',
  );
}

// ─── DPNS ───────────────────────────────────────────────────────────────

export async function executeDpnsRegister(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DpnsRegisterOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const material = await prepareSigning(signer, {
    purpose: 'AUTHENTICATION',
    minSecurityLevel: 'HIGH',
  });

  const identity = await sdk.identities.fetch(material.identityId);
  if (!identity) throw new Error(`Identity ${material.identityId} not found.`);

  await sdk.dpns.registerName({
    label: options.label,
    identity,
    identityKey: material.identityKey,
    signer: material.identitySigner,
  });

  return {
    kind: 'identity',
    identityId: material.identityId,
    message: `Registered ${options.label} on DPNS.`,
  };
}

// ─── voting ─────────────────────────────────────────────────────────────

export async function executeVotingCastVote(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: VotingCastVoteOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  void sdk;
  void options;
  // Voting requires a masternode voting key (Purpose: VOTING) — most users
  // signed in via a Bridge backup won't have one. Surfacing a clear error now
  // is better than calling the SDK with the wrong key purpose. Full wiring is
  // tracked under the voting follow-up.
  await prepareSigning(signer, { purpose: 'VOTING' });
  throw new Error(
    'Vote broadcast is not yet wired through this signer. You need a masternode ' +
      'voting key (purpose = VOTING) to cast a vote.',
  );
}
