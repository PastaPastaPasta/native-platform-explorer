// All SDK execution logic for the write operations lives here. Form components
// only collect input; the executors take EvoSDK + ExplorerSigner + form options
// and return a result the OperationShell renders.

import type {
  DataContract,
  Document,
  EvoSDK,
  Identity,
  IdentityPublicKeyInCreation,
} from '@dashevo/evo-sdk';
import { decodeWif } from '@/signer/local';
import type { ExplorerSigner, KeySelectionCriteria, SdkSigningMaterial } from '@/signer/types';
import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
  submitOperation,
  type ReceiptEntities,
} from './outcomes';
import { DPNS_CONTRACT_ID, operationRequirement, resolveSigningCriteria } from './capabilities';
import type { ContractRegisterOptions } from './forms/ContractRegister';
import type { ContractUpdateOptions } from './forms/ContractUpdate';
import type { DocumentCreateOptions } from './forms/DocumentCreate';
import type { DocumentReplaceOptions } from './forms/DocumentReplace';
import type { DocumentDeleteOptions } from './forms/DocumentDelete';
import type { DocumentTransferOptions } from './forms/DocumentTransfer';
import type { DocumentSetPriceOptions } from './forms/DocumentSetPrice';
import type { DocumentPurchaseOptions } from './forms/DocumentPurchase';
import type { IdentityCreditTransferOptions } from './forms/IdentityCreditTransfer';
import {
  validateCoreFeePerByte,
  validateWithdrawalAmount,
  type IdentityCreditWithdrawalOptions,
} from './forms/IdentityCreditWithdrawal';
import type { IdentityUpdateKeysOptions, NewIdentityKey } from './forms/IdentityUpdateKeys';
import type { IdentityTopUpOptions } from './forms/IdentityTopUp';
import { DPNS_TLD, type DpnsRegisterOptions } from './forms/DpnsRegister';
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
  newVersion: number;
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
  /** Document created by the operation (e.g. the DPNS domain), for receipt links. */
  contractId?: string;
  documentType?: string;
  documentId?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────

// wasm-bindgen objects are not GC'd by the JS heap — their Rust allocations
// only release on explicit `free()`. Every executor now goes through this
// helper so the IdentitySigner is freed after the broadcast resolves (or
// throws). Updated adapters release the selected public key as well. Older
// adapters still have their IdentitySigner freed by the fallback here.
async function withSigningMaterial<T>(
  signer: ExplorerSigner,
  criteria: () => Promise<KeySelectionCriteria | undefined>,
  fn: (material: SdkSigningMaterial, submit: typeof submitOperation) => Promise<T>,
): Promise<T> {
  if (!signer.prepareSdk) {
    throw new OperationNotSubmittedError(
      `The "${signer.kind}" signer does not support SDK signing yet. ` +
        'Connect via the Bridge backup tab on /wallet to enable writes.',
    );
  }
  let material: SdkSigningMaterial;
  try {
    material = await signer.prepareSdk(await criteria());
  } catch (error) {
    throw new OperationNotSubmittedError(error);
  }
  let submittedEntities: ReceiptEntities | null = null;
  const submit: typeof submitOperation = async (write, entities, assertCurrent) => {
    assertCurrent?.();
    submittedEntities = entities;
    return submitOperation(write, entities);
  };
  try {
    if (material.identityId !== signer.identityId) {
      throw new OperationNotSubmittedError(
        'Signing material does not match the reviewed identity.',
      );
    }
    return await fn(material, submit);
  } catch (error) {
    if (
      error instanceof BroadcastOutcomeUnknownError ||
      error instanceof OperationNotSubmittedError
    ) {
      throw error;
    }
    if (submittedEntities) throw new BroadcastOutcomeUnknownError(error, submittedEntities);
    throw new OperationNotSubmittedError(error);
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

/** The contract's `$defs`, serialised by the SDK as `schemaDefs`. */
function contractDefinitions(
  contract: DataContract,
  platformVersion: number,
): Record<string, object> | undefined {
  const defs = contract.toJSON(platformVersion).schemaDefs;
  return defs && typeof defs === 'object' && Object.keys(defs).length > 0
    ? (defs as Record<string, object>)
    : undefined;
}

// ─── contracts ───────────────────────────────────────────────────────────

export async function executeContractRegister(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: ContractRegisterOptions;
}): Promise<ContractRegisterResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    () => resolveSigningCriteria('contract.register', sdk, options),
    async (material, submit) => {
      const platformVersion = await getPlatformVersion(sdk);
      const { DataContract } = await import('@dashevo/evo-sdk');
      // The SDK fetches its own identity nonce and derives the published ID
      // from it, so the constructor nonce and ID here are placeholders. Do not
      // report this ID before the SDK returns the published contract.
      const dataContract = new DataContract({
        ownerId: material.identityId,
        identityNonce: 0n,
        schemas: options.documentSchemas as Record<string, object>,
        definitions: options.definitions ?? undefined,
        fullValidation: true,
        platformVersion,
      });

      const published = await submit(
        () =>
          sdk.contracts.publish({
            dataContract,
            identityKey: material.identityKey,
            signer: material.identitySigner,
          }),
        { identityId: material.identityId },
        args.assertCurrent,
      );

      const docSchemas = (published.schemas as Record<string, unknown> | undefined) ?? {};

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
  assertCurrent?: () => void;
  options: ContractUpdateOptions;
}): Promise<ContractUpdateResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    () => resolveSigningCriteria('contract.update', sdk, options),
    async (material, submit) => {
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

      if (options.baseVersion !== undefined && current.version !== options.baseVersion) {
        throw new Error(
          `Contract ${options.contractId} changed on Platform (version ${options.baseVersion} → ` +
            `${current.version}) after you loaded it. Reload the contract and review again.`,
        );
      }

      // Definitions are replaced together with schemas; omitting them would
      // delete the contract's existing $defs.
      const definitions =
        options.definitions === undefined
          ? contractDefinitions(current, platformVersion)
          : (options.definitions ?? undefined);
      current.setSchemas(
        options.documentSchemas as Record<string, object>,
        definitions ?? null,
        true,
        platformVersion,
      );
      // Platform only accepts an update whose version is exactly current + 1.
      const newVersion = current.version + 1;
      current.version = newVersion;

      await submit(
        () =>
          sdk.contracts.update({
            dataContract: current,
            identityKey: material.identityKey,
            signer: material.identitySigner,
          }),
        { identityId: material.identityId, contractId: options.contractId },
        args.assertCurrent,
      );

      return {
        kind: 'contractUpdate' as const,
        contractId: options.contractId,
        newVersion,
      };
    },
  );
}

// ─── documents ──────────────────────────────────────────────────────────

async function buildDocument(
  contractId: string,
  documentType: string,
  ownerId: string,
  properties: Record<string, unknown>,
  documentId?: string,
  revision?: bigint,
): Promise<Document> {
  const { Document } = await import('@dashevo/evo-sdk');
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
  assertCurrent?: () => void;
  options: DocumentCreateOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.create', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const document = await buildDocument(
      options.contractId,
      options.documentType,
      material.identityId,
      options.properties,
    );
    await submit(
      () =>
        sdk.documents.create({
          document,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: String(document.id),
      },
      args.assertCurrent,
    );
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
  assertCurrent?: () => void;
  options: DocumentReplaceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.replace', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const document = await buildDocument(
      options.contractId,
      options.documentType,
      material.identityId,
      options.properties,
      options.documentId,
      options.currentRevision + 1n,
    );
    await submit(
      () =>
        sdk.documents.replace({
          document,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: options.documentId,
      },
      args.assertCurrent,
    );
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
  assertCurrent?: () => void;
  options: DocumentDeleteOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.delete', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    await submit(
      () =>
        sdk.documents.delete({
          document: {
            id: options.documentId,
            ownerId: material.identityId,
            dataContractId: options.contractId,
            documentTypeName: options.documentType,
          },
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: options.documentId,
      },
      args.assertCurrent,
    );
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
  assertCurrent?: () => void;
  options: DocumentTransferOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.transfer', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    const { Identifier } = await import('@dashevo/evo-sdk');
    const recipientId = Identifier.fromBase58(options.recipientId);
    await submit(
      () =>
        sdk.documents.transfer({
          document: existing,
          recipientId,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        recipientId: options.recipientId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: options.documentId,
      },
      args.assertCurrent,
    );
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
  assertCurrent?: () => void;
  options: DocumentSetPriceOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.setPrice', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    await submit(
      () =>
        sdk.documents.setPrice({
          document: existing,
          price: options.priceCredits,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: options.documentId,
      },
      args.assertCurrent,
    );
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
  assertCurrent?: () => void;
  options: DocumentPurchaseOptions;
}): Promise<DocumentResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('document.purchase', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const existing = await fetchExistingDocument(
      sdk,
      options.contractId,
      options.documentType,
      options.documentId,
    );
    const { Identifier } = await import('@dashevo/evo-sdk');
    // The buyer is whoever is signing; pass the active identity, not the
    // key's optional contractBounds metadata.
    const buyerId = Identifier.fromBase58(material.identityId);
    await submit(
      () =>
        sdk.documents.purchase({
          document: existing,
          buyerId,
          price: options.priceCredits,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      {
        identityId: material.identityId,
        contractId: options.contractId,
        documentType: options.documentType,
        documentId: options.documentId,
      },
      args.assertCurrent,
    );
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

interface CreditTransferFacadeOptions {
  identity: Identity;
  recipientId: string;
  amount: bigint;
  signer: SdkSigningMaterial['identitySigner'];
  signingKey: SdkSigningMaterial['identityKey'];
}

export async function executeIdentityCreditTransfer(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: IdentityCreditTransferOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    () => resolveSigningCriteria('identity.creditTransfer', sdk, options),
    async (material, submit) => {
      const identity = await fetchExistingIdentity(sdk, material.identityId);
      // SDK rc.2 merges the facade's IdentityCreditTransferOptions with the raw
      // transition's (which adds senderId/nonce). Type-check the real facade
      // shape here, then cast only across that upstream declaration collision.
      const transfer: CreditTransferFacadeOptions = {
        identity,
        recipientId: options.recipientId,
        amount: options.amountCredits,
        signer: material.identitySigner,
        signingKey: material.identityKey,
      };
      const result = await submit(
        () =>
          sdk.identities.creditTransfer(
            transfer as unknown as Parameters<typeof sdk.identities.creditTransfer>[0],
          ),
        { identityId: material.identityId, recipientId: options.recipientId },
        args.assertCurrent,
      );
      return {
        kind: 'identity' as const,
        identityId: material.identityId,
        message: `Transferred ${options.amountCredits} credits to ${options.recipientId}.`,
        newBalance: result?.senderBalance !== undefined ? String(result.senderBalance) : undefined,
      };
    },
  );
}

export async function executeIdentityCreditWithdrawal(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: IdentityCreditWithdrawalOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('identity.creditWithdrawal', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const amount = validateWithdrawalAmount(String(options.amountCredits));
    const fee = validateCoreFeePerByte(String(options.coreFeePerByte));
    if (amount.error || fee.error) throw new Error(amount.error ?? fee.error);
    if (options.toAddress !== undefined) {
      const { wallet } = await import('@dashevo/evo-sdk');
      if (!(await wallet.validateAddress(options.toAddress, options.network)))
        throw new Error(`${options.toAddress} is not a valid ${options.network} Dash address.`);
    }
    const identity = await fetchExistingIdentity(sdk, material.identityId);
    const newBalance = await submit(
      () =>
        sdk.identities.creditWithdrawal({
          identity,
          amount: options.amountCredits,
          toAddress: options.toAddress,
          coreFeePerByte: options.coreFeePerByte,
          signer: material.identitySigner,
          signingKey: material.identityKey,
        }),
      { identityId: material.identityId },
      args.assertCurrent,
    );
    return {
      kind: 'identity' as const,
      identityId: material.identityId,
      message: `Withdrew ${options.amountCredits} credits to ${
        options.toAddress ?? 'the masternode payout address'
      }.`,
      newBalance: String(newBalance),
    };
  });
}

export async function executeIdentityUpdateKeys(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: IdentityUpdateKeysOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  return withSigningMaterial(
    signer,
    () => resolveSigningCriteria('identity.updateKeys', sdk, options),
    async (material, submit) => {
      const identity = await fetchExistingIdentity(sdk, material.identityId);
      const addPublicKeys = options.addKeys?.length
        ? await newIdentityKeys(options.addKeys, options.network, material)
        : undefined;
      await submit(
        () =>
          sdk.identities.update({
            identity,
            addPublicKeys,
            disablePublicKeys:
              options.disableKeyIds && options.disableKeyIds.length > 0
                ? options.disableKeyIds
                : undefined,
            signer: material.identitySigner,
          }),
        { identityId: material.identityId },
        args.assertCurrent,
      );
      return {
        kind: 'identity' as const,
        identityId: material.identityId,
        message: 'Identity keys updated.',
      };
    },
  );
}

/**
 * Build the keys to add and load their private keys into the update's signer:
 * the SDK signs each new ECDSA_SECP256K1 key's proof of possession with the
 * same signer as the master key (overwriting any supplied signature) and
 * assigns key IDs itself.
 */
async function newIdentityKeys(
  keys: NewIdentityKey[],
  network: 'mainnet' | 'testnet',
  material: SdkSigningMaterial,
): Promise<IdentityPublicKeyInCreation[]> {
  const { IdentityPublicKeyInCreation, PrivateKey } = await import('@dashevo/evo-sdk');
  const created: IdentityPublicKeyInCreation[] = [];
  for (const key of keys) {
    const decoded = await decodeWif(key.privateKeyWif);
    try {
      if (decoded.network !== network)
        throw new Error(`A new key's private key is for ${decoded.network}, not ${network}.`);
      const privateKey = PrivateKey.fromBytes(decoded.bytes, decoded.network);
      try {
        const publicKey = privateKey.getPublicKey();
        try {
          created.push(
            new IdentityPublicKeyInCreation({
              keyId: 0,
              purpose: lower(key.purpose),
              securityLevel: lower(key.securityLevel),
              keyType: lower(key.keyType),
              data:
                key.keyType === 'ECDSA_HASH160'
                  ? hexToBytes(privateKey.getPublicKeyHash())
                  : publicKey.toBytes(),
            }),
          );
        } finally {
          publicKey.free();
        }
        material.identitySigner.addKey(privateKey);
      } finally {
        privateKey.free();
      }
    } finally {
      decoded.bytes.fill(0);
    }
  }
  return created;
}

const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>;

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16));
}

export async function executeIdentityTopUp(_args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: IdentityTopUpOptions;
}): Promise<IdentityResult> {
  // Top-up requires an asset-lock proof, which is built end-to-end inside the
  // bridge (Core wallet UTXO → Type-8 special tx → InstantSend proof). We
  // intentionally don't replicate that flow in the explorer; the form deep-
  // links the user to the bridge instead. This executor only ever runs if the
  // user clicks "Broadcast" past the deep-link CTA.
  throw new OperationNotSubmittedError(
    'Top-up runs in the Dash Platform bridge — click "Open bridge" on the form ' +
      'instead. When the bridge completes the top-up, return to the explorer ' +
      'and refresh the identity page to check the balance.',
  );
}

// ─── DPNS ───────────────────────────────────────────────────────────────

export async function executeDpnsRegister(args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: DpnsRegisterOptions;
}): Promise<IdentityResult> {
  const { sdk, signer, options } = args;
  const criteria = () => resolveSigningCriteria('dpns.registerName', sdk, options);
  return withSigningMaterial(signer, criteria, async (material, submit) => {
    const identity = await fetchExistingIdentity(sdk, material.identityId);
    const registered = await submit(
      () =>
        sdk.dpns.registerName({
          label: options.label,
          identity,
          identityKey: material.identityKey,
          signer: material.identitySigner,
        }),
      { identityId: material.identityId, contractId: DPNS_CONTRACT_ID, documentType: 'domain' },
      args.assertCurrent,
    );
    const name = registered.fullDomainName || `${options.label}.${DPNS_TLD}`;
    return {
      kind: 'identity' as const,
      identityId: material.identityId,
      message: options.contested
        ? `Submitted a contested registration for ${name}. Masternodes vote on the winner.`
        : `Registered ${name} on DPNS.`,
      contractId: DPNS_CONTRACT_ID,
      documentType: 'domain',
      documentId: String(registered.domainDocumentId),
    };
  });
}

// ─── voting ─────────────────────────────────────────────────────────────

export async function executeVotingCastVote(_args: {
  sdk: EvoSDK;
  signer: ExplorerSigner;
  assertCurrent?: () => void;
  options: VotingCastVoteOptions;
}): Promise<IdentityResult> {
  // Unsupported execution must fail before allocating any signing material.
  throw new OperationNotSubmittedError(operationRequirement('voting.castVote').reason);
}
