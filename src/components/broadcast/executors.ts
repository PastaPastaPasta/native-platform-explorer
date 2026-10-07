// All SDK execution logic for the write operations lives here. Form components
// only collect input; the executors take EvoSDK + ExplorerSigner + form options
// and return a result the OperationShell renders.

import {
  DataContract,
  Document,
  IdentityPublicKeyInCreation,
} from '@dashevo/evo-sdk';
import type { EvoSDK, Identity } from '@dashevo/evo-sdk';
import { operationRequirement } from './capabilities';
import type {
  ExplorerSigner,
  KeySelectionCriteria,
  SdkSigningMaterial,
} from '@/signer/types';
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

// wasm-bindgen objects are not GC'd by the JS heap — their Rust allocations
// only release on explicit `free()`. Every executor now goes through this
// helper so the IdentitySigner is freed after the broadcast resolves (or
// throws). Local adapters also own the selected public key and provide a
// release callback for both objects. Keep the signer-only fallback for adapters
// that do not provide that callback.
async function withSigningMaterial<T>(
  signer: ExplorerSigner,
  criteria: KeySelectionCriteria | undefined,
  fn: (material: SdkSigningMaterial) => Promise<T>,
): Promise<T> {
  if (!signer.prepareSdk) {
    throw new Error(
      `The "${signer.kind}" signer does not support SDK signing yet. ` +
        'Connect via the Bridge backup tab on /wallet to enable writes.',
    );
  }
  const material = await signer.prepareSdk(criteria);
  try {
    return await fn(material);
  } finally {
    try {
      if (material.release) material.release();
      else material.identitySigner.free();
    } catch {
      /* already freed or build without free — best-effort */
    }
  }
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
  return withSigningMaterial(
    signer,
    operationRequirement('contract.register').criteria,
    async (material) => {
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
        kind: 'contractRegister' as const,
        contractId: String(published.id),
        ownerId: String(published.ownerId),
        version: published.version,
        documentTypes: Object.keys(docSchemas),
      };
    },
  );
}

export async function executeContractUpdate(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: ContractUpdateOptions;
}): Promise<ContractUpdateResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    operationRequirement('contract.update').criteria,
    async (material) => {
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
        kind: 'contractUpdate' as const,
        contractId: options.contractId,
        newVersion: current.version,
      };
    },
  );
}

// ─── documents ──────────────────────────────────────────────────────────

function buildDocument(
  contractId: string,
  documentType: string,
  ownerId: string,
  properties: Record<string, unknown>,
  documentId?: string,
  revision?: bigint,
): Document {
  return new Document({
    properties,
    documentTypeName: documentType,
    dataContractId: contractId,
    ownerId,
    id: documentId,
    revision: revision ?? 1n,
  });
}

async function fetchExistingDocument(
  sdk: EvoSDK,
  contractId: string,
  documentType: string,
  documentId: string,
): Promise<Document> {
  const existing = await sdk.documents.get(contractId, documentType, documentId);
  if (!existing) throw new Error(`Document ${documentId} not found.`);
  return existing;
}

async function fetchExistingIdentity(sdk: EvoSDK, identityId: string): Promise<Identity> {
  const identity = await sdk.identities.fetch(identityId);
  if (!identity) throw new Error(`Identity ${identityId} not found.`);
  return identity;
}

export async function executeDocumentCreate(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentCreateOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.create').criteria, async (material) => {
    const document = buildDocument(
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
      kind: 'document' as const,
      action: 'create' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: String(document.id),
      ownerId: material.identityId,
    };
  });
}

export async function executeDocumentReplace(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentReplaceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.replace').criteria, async (material) => {
    const document = buildDocument(
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
      kind: 'document' as const,
      action: 'replace' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: options.documentId,
      ownerId: material.identityId,
    };
  });
}

export async function executeDocumentDelete(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentDeleteOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.delete').criteria, async (material) => {
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
      kind: 'document' as const,
      action: 'delete' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: options.documentId,
      ownerId: material.identityId,
    };
  });
}

export async function executeDocumentTransfer(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentTransferOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.transfer').criteria, async (material) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    await sdk.documents.transfer({
      document: existing,
      recipientId: options.recipientId as unknown as Parameters<
        typeof sdk.documents.transfer
      >[0]['recipientId'],
      identityKey: material.identityKey,
      signer: material.identitySigner,
    });
    return {
      kind: 'document' as const,
      action: 'transfer' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: options.documentId,
      ownerId: material.identityId,
    };
  });
}

export async function executeDocumentSetPrice(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentSetPriceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.setPrice').criteria, async (material) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    await sdk.documents.setPrice({
      document: existing,
      price: options.priceCredits,
      identityKey: material.identityKey,
      signer: material.identitySigner,
    });
    return {
      kind: 'document' as const,
      action: 'setPrice' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: options.documentId,
      ownerId: material.identityId,
    };
  });
}

export async function executeDocumentPurchase(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: DocumentPurchaseOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('document.purchase').criteria, async (material) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    await sdk.documents.purchase({
      document: existing,
      // The buyer is whoever is signing; pass the active identity, not the
      // key's optional contractBounds metadata.
      buyerId: material.identityId as unknown as Parameters<
        typeof sdk.documents.purchase
      >[0]['buyerId'],
      price: options.priceCredits,
      identityKey: material.identityKey,
      signer: material.identitySigner,
    });
    return {
      kind: 'document' as const,
      action: 'purchase' as const,
      contractId: options.contractId,
      documentType: options.documentType,
      documentId: options.documentId,
      ownerId: material.identityId,
    };
  });
}

// ─── identity ───────────────────────────────────────────────────────────

export async function executeIdentityCreditTransfer(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityCreditTransferOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('identity.creditTransfer').criteria, async (material) => {
    const identity = await fetchExistingIdentity(sdk, material.identityId);
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
      kind: 'identity' as const,
      identityId: material.identityId,
      message: `Transferred ${options.amountCredits} credits to ${options.recipientId}.`,
      newBalance: result?.senderBalance ? String(result.senderBalance) : undefined,
    };
  });
}

export async function executeIdentityCreditWithdrawal(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityCreditWithdrawalOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(signer, operationRequirement('identity.creditWithdrawal').criteria, async (material) => {
    const identity = await fetchExistingIdentity(sdk, material.identityId);
    const newBalance = await sdk.identities.creditWithdrawal({
      identity,
      amount: options.amountCredits,
      toAddress: options.toAddress,
      coreFeePerByte: options.coreFeePerByte,
      signer: material.identitySigner,
      signingKey: material.identityKey,
    } as unknown as Parameters<typeof sdk.identities.creditWithdrawal>[0]);
    return {
      kind: 'identity' as const,
      identityId: material.identityId,
      message: `Withdrew ${options.amountCredits} credits to ${options.toAddress}.`,
      newBalance: String(newBalance),
    };
  });
}

export async function executeIdentityUpdateKeys(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: IdentityUpdateKeysOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    operationRequirement('identity.updateKeys').criteria,
    async (material) => {
      const identity = await fetchExistingIdentity(sdk, material.identityId);
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
        kind: 'identity' as const,
        identityId: material.identityId,
        message: 'Identity keys updated.',
      };
    },
  );
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
  return withSigningMaterial(signer, operationRequirement('dpns.registerName').criteria, async (material) => {
    const identity = await fetchExistingIdentity(sdk, material.identityId);
    await sdk.dpns.registerName({
      label: options.label,
      identity,
      identityKey: material.identityKey,
      signer: material.identitySigner,
    });
    return {
      kind: 'identity' as const,
      identityId: material.identityId,
      message: `Registered ${options.label} on DPNS.`,
    };
  });
}

// ─── voting ─────────────────────────────────────────────────────────────

export async function executeVotingCastVote(_args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  options: VotingCastVoteOptions;
}): Promise<IdentityResult> {
  // Unsupported execution must fail before allocating any signing material.
  throw new Error(operationRequirement('voting.castVote').reason);
}
