import { describe, expect, it, vi } from 'vitest';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
import {
  executeDocumentCreate,
  executeDocumentTransfer,
  executeIdentityCreditTransfer,
} from '../executors';
import { BroadcastOutcomeUnknownError, OperationNotSubmittedError } from '../outcomes';

vi.mock('@dashevo/evo-sdk', () => {
  class Document {
    id: string;
    ownerId: string;
    dataContractId: string;
    documentTypeName: string;
    properties: Record<string, unknown>;

    constructor(args: {
      id?: string;
      ownerId: string;
      dataContractId: string;
      documentTypeName: string;
      properties: Record<string, unknown>;
    }) {
      this.id = args.id ?? 'generated-document-id';
      this.ownerId = args.ownerId;
      this.dataContractId = args.dataContractId;
      this.documentTypeName = args.documentTypeName;
      this.properties = args.properties;
    }
  }

  return {
    DataContract: class DataContract {},
    Document,
    IdentityPublicKeyInCreation: class IdentityPublicKeyInCreation {},
  };
});

describe('broadcast executors', () => {
  it('creates documents with SDK signing material and frees it after success', async () => {
    const free = vi.fn();
    const material = createSigningMaterial({
      identityId: 'owner-1',
      identitySigner: { free } as never,
    });
    const signer = createMockSigner({
      identityId: 'owner-1',
      prepareSdk: vi.fn().mockResolvedValue(material),
    });
    const create = vi.fn().mockResolvedValue(undefined);
    const sdk = {
      documents: { create },
    };

    const result = await executeDocumentCreate({
      sdk: sdk as never,
      signer,
      options: {
        contractId: 'contract-1',
        documentType: 'note',
        properties: { title: 'hello' },
      },
    });

    expect(create).toHaveBeenCalledWith({
      document: expect.objectContaining({
        id: 'generated-document-id',
        dataContractId: 'contract-1',
        documentTypeName: 'note',
        ownerId: 'owner-1',
        properties: { title: 'hello' },
      }),
      identityKey: material.identityKey,
      signer: material.identitySigner,
    });
    expect(free).toHaveBeenCalledOnce();
    expect(result).toEqual({
      kind: 'document',
      action: 'create',
      contractId: 'contract-1',
      documentType: 'note',
      documentId: 'generated-document-id',
      ownerId: 'owner-1',
    });
  });

  it('frees SDK signing material after broadcast failures', async () => {
    const free = vi.fn();
    const signer = createMockSigner({
      prepareSdk: vi.fn().mockResolvedValue(
        createSigningMaterial({
          identitySigner: { free } as never,
        }),
      ),
    });
    const sdk = {
      documents: {
        create: vi.fn().mockRejectedValue(new Error('broadcast failed')),
      },
    };

    await expect(
      executeDocumentCreate({
        sdk: sdk as never,
        signer,
        options: {
          contractId: 'contract-1',
          documentType: 'note',
          properties: {},
        },
      }),
    ).rejects.toThrow('broadcast failed');

    expect(free).toHaveBeenCalledOnce();
  });

  it('preserves the document identifier when the broadcast outcome is unknown', async () => {
    const sdk = {
      documents: { create: vi.fn().mockRejectedValue(new Error('request timed out')) },
    };
    const error = await executeDocumentCreate({
      sdk: sdk as never,
      signer: createMockSigner(),
      options: { contractId: 'contract-1', documentType: 'note', properties: {} },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect((error as BroadcastOutcomeUnknownError).entities).toEqual({
      identityId: 'identity-1',
      contractId: 'contract-1',
      documentType: 'note',
      documentId: 'generated-document-id',
    });
  });

  it('classifies signing preparation failures as not submitted', async () => {
    const create = vi.fn();
    await expect(
      executeDocumentCreate({
        sdk: { documents: { create } } as never,
        signer: createMockSigner({
          prepareSdk: vi.fn().mockRejectedValue(new Error('No eligible key')),
        }),
        options: { contractId: 'contract-1', documentType: 'note', properties: {} },
      }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects signing material for a different identity before submission', async () => {
    const create = vi.fn();
    const material = createSigningMaterial({ identityId: 'another-identity' });
    await expect(
      executeDocumentCreate({
        sdk: { documents: { create } } as never,
        signer: createMockSigner({ prepareSdk: vi.fn().mockResolvedValue(material) }),
        options: { contractId: 'contract-1', documentType: 'note', properties: {} },
      }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(create).not.toHaveBeenCalled();
    expect(material.identitySigner.free).toHaveBeenCalledOnce();
  });

  it('keeps read failures before the write distinct from submission errors', async () => {
    const transfer = vi.fn();
    await expect(
      executeDocumentTransfer({
        sdk: {
          documents: { get: vi.fn().mockRejectedValue(new Error('read timeout')), transfer },
        } as never,
        signer: createMockSigner(),
        options: {
          contractId: 'contract-1',
          documentType: 'note',
          documentId: 'doc-1',
          recipientId: 'recipient-1',
        },
      }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('rechecks the reviewed context immediately before submitting and releases all material', async () => {
    const release = vi.fn();
    const material = { ...createSigningMaterial(), release };
    const create = vi.fn();
    await expect(
      executeDocumentCreate({
        sdk: { documents: { create } } as never,
        signer: createMockSigner({ prepareSdk: vi.fn().mockResolvedValue(material) }),
        options: { contractId: 'contract-1', documentType: 'note', properties: {} },
        assertCurrent: () => {
          throw new OperationNotSubmittedError('Session changed');
        },
      }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(create).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(material.identitySigner.free).not.toHaveBeenCalled();
  });

  it('does not label post-submission receipt errors as a local rejection', async () => {
    const create = vi.fn().mockImplementation(async ({ document }) => {
      Object.defineProperty(document, 'id', {
        get: () => {
          throw new Error('Unable to read receipt');
        },
      });
    });
    await expect(
      executeDocumentCreate({
        sdk: { documents: { create } } as never,
        signer: createMockSigner(),
        options: { contractId: 'contract-1', documentType: 'note', properties: {} },
      }),
    ).rejects.toBeInstanceOf(BroadcastOutcomeUnknownError);
  });

  it('includes a zero credit balance in the successful transfer receipt', async () => {
    const result = await executeIdentityCreditTransfer({
      sdk: {
        identities: {
          fetch: vi.fn().mockResolvedValue({}),
          creditTransfer: vi.fn().mockResolvedValue({ senderBalance: 0n }),
        },
      } as never,
      signer: createMockSigner(),
      options: { recipientId: 'recipient-1', amountCredits: 100n },
    });
    expect(result.newBalance).toBe('0');
  });
});
