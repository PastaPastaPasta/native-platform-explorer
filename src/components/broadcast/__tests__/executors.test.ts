import { describe, expect, it, vi } from 'vitest';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
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
  executeVotingCastVote,
} from '../executors';
import { operationRequirement } from '../capabilities';
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
    DataContract: class DataContract {
      id = 'placeholder-contract-id';
      constructor(readonly args: unknown) {}
    },
    Document,
    IdentityPublicKeyInCreation: class IdentityPublicKeyInCreation {},
  };
});

// Document executors read the document type's signing requirement first.
const noteContracts = (schema: object = {}) => ({
  fetch: vi.fn().mockResolvedValue({ schemas: { note: schema } }),
});

describe('broadcast executors', () => {
  it('rejects unsupported voting without allocating signing material', async () => {
    const prepareSdk = vi.fn();
    await expect(executeVotingCastVote({
      sdk: {} as never,
      signer: createMockSigner({ prepareSdk }),
      options: {} as never,
    })).rejects.toThrow(/vote broadcasting is unavailable/i);
    expect(prepareSdk).not.toHaveBeenCalled();
  });

  it.each([
    ['contract.register', executeContractRegister],
    ['contract.update', executeContractUpdate],
    ['document.create', executeDocumentCreate],
    ['document.replace', executeDocumentReplace],
    ['document.delete', executeDocumentDelete],
    ['document.transfer', executeDocumentTransfer],
    ['document.setPrice', executeDocumentSetPrice],
    ['document.purchase', executeDocumentPurchase],
    ['identity.creditTransfer', executeIdentityCreditTransfer],
    ['identity.creditWithdrawal', executeIdentityCreditWithdrawal],
    ['identity.updateKeys', executeIdentityUpdateKeys],
    ['dpns.registerName', executeDpnsRegister],
  ] as const)('applies the declared key requirements before executing %s', async (id, execute) => {
    const stop = new Error('stop before broadcast');
    const prepareSdk = vi.fn().mockRejectedValue(stop);
    const signer = createMockSigner({ prepareSdk });

    await expect(
      execute({
        sdk: { contracts: noteContracts() } as never,
        signer,
        options: { contractId: 'contract-1', documentType: 'note' } as never,
      }),
    ).rejects.toThrow('stop before broadcast');
    expect(prepareSdk).toHaveBeenCalledOnce();
    // Executors may narrow the declared requirement for the target, never widen it.
    const used = prepareSdk.mock.calls[0]![0];
    const declared = operationRequirement(id).criteria!;
    expect(declared.allowedSecurityLevels).toEqual(
      expect.arrayContaining(used.allowedSecurityLevels),
    );
    expect([declared.purpose].flat()).toEqual(expect.arrayContaining([used.purpose].flat()));
  });

  it.each([
    [undefined, 'OWNER'],
    ['yAddress', 'TRANSFER'],
  ])('signs withdrawals to %s with a %s key', async (toAddress, purpose) => {
    const prepareSdk = vi.fn().mockRejectedValue(new Error('stop'));
    await executeIdentityCreditWithdrawal({
      sdk: {} as never,
      signer: createMockSigner({ prepareSdk }),
      options: { network: 'testnet', toAddress, amountCredits: 190_000n, coreFeePerByte: 1 },
    }).catch(() => undefined);
    expect(prepareSdk).toHaveBeenCalledWith({ purpose, allowedSecurityLevels: ['CRITICAL'] });
  });

  it.each([
    [{ amountCredits: 0x10n }, /between 190,000/],
    [{ coreFeePerByte: 4 }, /Fibonacci/],
  ])('rejects invalid withdrawal parameters before submitting', async (patch, message) => {
    const creditWithdrawal = vi.fn();
    const execution = executeIdentityCreditWithdrawal({
      sdk: { identities: { fetch: vi.fn(), creditWithdrawal } } as never,
      signer: createMockSigner(),
      options: { network: 'testnet', amountCredits: 190_000n, coreFeePerByte: 1, ...patch },
    });
    await expect(execution).rejects.toBeInstanceOf(OperationNotSubmittedError);
    await expect(execution).rejects.toThrow(message);
    expect(creditWithdrawal).not.toHaveBeenCalled();
  });

  it.each([false, true])('releases all adapter-owned signing material (failure: %s)', async (fails) => {
    const signerFree = vi.fn();
    const keyFree = vi.fn();
    const release = vi.fn(() => {
      signerFree();
      keyFree();
    });
    const signer = createMockSigner({
      prepareSdk: vi.fn().mockResolvedValue(createSigningMaterial({
        identitySigner: { free: signerFree } as never,
        identityKey: { free: keyFree } as never,
        release,
      })),
    });
    const create = fails
      ? vi.fn().mockRejectedValue(new Error('broadcast failed'))
      : vi.fn().mockResolvedValue(undefined);
    const execution = executeDocumentCreate({
      sdk: { contracts: noteContracts(), documents: { create } } as never,
      signer,
      options: { contractId: 'contract-1', documentType: 'note', properties: {} },
    });
    if (fails) await expect(execution).rejects.toThrow('broadcast failed');
    else await execution;

    expect(release).toHaveBeenCalledOnce();
    expect(signerFree).toHaveBeenCalledOnce();
    expect(keyFree).toHaveBeenCalledOnce();
  });

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
      contracts: noteContracts(), documents: { create },
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
      contracts: noteContracts(), documents: {
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
      contracts: noteContracts(), documents: { create: vi.fn().mockRejectedValue(new Error('request timed out')) },
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
        sdk: { contracts: noteContracts(), documents: { create } } as never,
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
        sdk: { contracts: noteContracts(), documents: { create } } as never,
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
          contracts: noteContracts(), documents: { get: vi.fn().mockRejectedValue(new Error('read timeout')), transfer },
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
        sdk: { contracts: noteContracts(), documents: { create } } as never,
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
        sdk: { contracts: noteContracts(), documents: { create } } as never,
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

  it('does not predict a contract ID for an unknown publish outcome', async () => {
    const nonce = vi.fn();
    const error = await executeContractRegister({
      sdk: {
        version: vi.fn().mockResolvedValue(1),
        identities: { nonce },
        contracts: { publish: vi.fn().mockRejectedValue(new Error('request timed out')) },
      } as never,
      signer: createMockSigner(),
      options: { ownerId: 'identity-1', documentSchemas: { note: { type: 'object' } } },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect((error as BroadcastOutcomeUnknownError).entities).toEqual({ identityId: 'identity-1' });
    expect(nonce).not.toHaveBeenCalled();
  });

  it('reports the contract ID the SDK actually published', async () => {
    const publish = vi.fn().mockResolvedValue({
      id: 'published-id',
      ownerId: 'identity-1',
      version: 1,
      schemas: { note: {} },
    });
    const result = await executeContractRegister({
      sdk: { version: vi.fn().mockResolvedValue(1), contracts: { publish } } as never,
      signer: createMockSigner(),
      options: {
        ownerId: 'identity-1',
        documentSchemas: { note: { type: 'object' } },
        definitions: { title: { type: 'string' } },
      },
    });
    expect(result.contractId).toBe('published-id');
    expect(publish.mock.calls[0]![0].dataContract.args).toMatchObject({
      definitions: { title: { type: 'string' } },
    });
  });

  describe('contract updates', () => {
    function contract(version = 3) {
      return {
        ownerId: 'identity-1',
        version,
        setSchemas: vi.fn(),
        toJSON: vi.fn(() => ({ schemaDefs: { title: { type: 'string' } } })),
      };
    }
    const run = (current: ReturnType<typeof contract>, options: object) => {
      const update = vi.fn().mockResolvedValue(undefined);
      const execution = executeContractUpdate({
        sdk: {
          version: vi.fn().mockResolvedValue(9),
          contracts: { fetch: vi.fn().mockResolvedValue(current), update },
        } as never,
        signer: createMockSigner(),
        options: { contractId: 'contract-1', documentSchemas: { note: {} }, ...options },
      });
      return { execution, update };
    };

    it('increments the version and keeps on-chain definitions by default', async () => {
      const current = contract();
      const { execution, update } = run(current, { baseVersion: 3 });
      await expect(execution).resolves.toEqual({
        kind: 'contractUpdate',
        contractId: 'contract-1',
        newVersion: 4,
      });
      expect(current.setSchemas).toHaveBeenCalledWith(
        { note: {} },
        { title: { type: 'string' } },
        true,
        9,
      );
      expect(update.mock.calls[0]![0].dataContract.version).toBe(4);
    });

    it.each([
      ['replaces', { defs: {} }, { defs: {} }],
      ['removes', null, null],
    ])('%s definitions when the form says so', async (_, definitions, expected) => {
      const current = contract();
      await run(current, { definitions }).execution;
      expect(current.setSchemas).toHaveBeenCalledWith({ note: {} }, expected, true, 9);
    });

    it('refuses to publish edits made against an older version', async () => {
      const { execution, update } = run(contract(5), { baseVersion: 3 });
      await expect(execution).rejects.toBeInstanceOf(OperationNotSubmittedError);
      await expect(execution).rejects.toThrow(/version 3 → 5/);
      expect(update).not.toHaveBeenCalled();
    });
  });

  it.each([
    [false, 'Registered alice.dash on DPNS.'],
    [true, 'Submitted a contested registration for alice.dash. Masternodes vote on the winner.'],
  ])('registers DPNS names for the signer and links the domain document (contested: %s)', async (contested, message) => {
    const registerName = vi.fn().mockResolvedValue({
      preorderDocumentId: 'preorder-1',
      domainDocumentId: 'domain-1',
      fullDomainName: 'alice.dash',
    });
    const identity = { id: 'identity-1' };
    const result = await executeDpnsRegister({
      sdk: {
        identities: { fetch: vi.fn().mockResolvedValue(identity) },
        dpns: { registerName },
      } as never,
      signer: createMockSigner(),
      options: { label: 'alice', contested },
    });
    expect(registerName).toHaveBeenCalledWith(expect.objectContaining({ label: 'alice', identity }));
    expect(result).toEqual({
      kind: 'identity',
      identityId: 'identity-1',
      message,
      contractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      documentType: 'domain',
      documentId: 'domain-1',
    });
  });

  it.each([
    [undefined, ['CRITICAL', 'HIGH']],
    [1, ['CRITICAL']],
    [3, ['CRITICAL', 'HIGH', 'MEDIUM']],
    [0, ['MASTER']],
  ])(
    'signs documents with the levels their type requires (signatureSecurityLevelRequirement %s)',
    async (requirement, levels) => {
      const prepareSdk = vi.fn().mockRejectedValue(new Error('stop'));
      await executeDocumentDelete({
        sdk: {
          contracts: noteContracts(
            requirement === undefined ? {} : { signatureSecurityLevelRequirement: requirement },
          ),
        } as never,
        signer: createMockSigner({ prepareSdk }),
        options: { contractId: 'contract-1', documentType: 'note', documentId: 'doc-1' },
      }).catch(() => undefined);
      expect(prepareSdk).toHaveBeenCalledWith({
        purpose: 'AUTHENTICATION',
        allowedSecurityLevels: levels,
        target: { contractId: 'contract-1', documentType: 'note' },
      });
    },
  );

  it('does not sign for a document type the contract does not define', async () => {
    const prepareSdk = vi.fn();
    await expect(
      executeDocumentCreate({
        sdk: { contracts: noteContracts() } as never,
        signer: createMockSigner({ prepareSdk }),
        options: { contractId: 'contract-1', documentType: 'missing', properties: {} },
      }),
    ).rejects.toBeInstanceOf(OperationNotSubmittedError);
    expect(prepareSdk).not.toHaveBeenCalled();
  });
});
