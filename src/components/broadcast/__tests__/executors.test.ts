import { describe, expect, it, vi } from 'vitest';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
import { executeDocumentCreate } from '../executors';

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
});

