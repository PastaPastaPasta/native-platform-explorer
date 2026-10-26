import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DataContract,
  DataContractUpdateTransition,
  IdentityPublicKey,
  PlatformVersion,
  PrivateKey,
  wallet,
} from '@dashevo/evo-sdk';
import { createMockSigner, createSigningMaterial } from '@/test/signer';
import { executeContractUpdate } from '../executors';

// These tests use the real pinned WASM SDK. Only network reads and the final
// SDK write call are replaced; the captured transition inputs are then signed
// offline with a throwaway key to prove their shape. Nothing is broadcast.
const OWNER = '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr';
const THROWAWAY_HEX = '0'.repeat(63) + '1';

let platformVersion: ReturnType<typeof PlatformVersion.latest>;
beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
  platformVersion = PlatformVersion.latest();
});

function onChainContract() {
  return new DataContract({
    ownerId: OWNER,
    identityNonce: 1n,
    schemas: {
      note: {
        type: 'object',
        properties: { title: { $ref: '#/$defs/title', position: 0 } },
        additionalProperties: false,
      },
    },
    definitions: { title: { type: 'string', maxLength: 63 } },
    fullValidation: true,
    platformVersion,
  });
}

describe('executors with the real WASM SDK', () => {
  it('publishes contract updates as the next version with existing definitions intact', async () => {
    const current = onChainContract();
    const update = vi.fn().mockResolvedValue(undefined);
    const sdk = {
      version: vi.fn().mockResolvedValue(platformVersion),
      contracts: { fetch: vi.fn().mockResolvedValue(current), update },
    };
    const schemas = {
      note: {
        type: 'object',
        properties: {
          title: { $ref: '#/$defs/title', position: 0 },
          body: { type: 'string', maxLength: 255, position: 1 },
        },
        additionalProperties: false,
      },
    };

    const result = await executeContractUpdate({
      sdk: sdk as never,
      signer: createMockSigner({
        identityId: OWNER,
        prepareSdk: vi.fn().mockResolvedValue(createSigningMaterial({ identityId: OWNER })),
      }),
      options: { contractId: String(current.id), baseVersion: 1, documentSchemas: schemas },
    });

    expect(result).toEqual({ kind: 'contractUpdate', contractId: String(current.id), newVersion: 2 });
    const submitted = update.mock.calls[0]![0].dataContract as DataContract;
    expect(submitted.version).toBe(2);
    const json = submitted.toJSON(platformVersion);
    expect(json.schemaDefs).toEqual({ title: { type: 'string', maxLength: 63 } });
    expect(Object.keys((json.documentSchemas.note as { properties: object }).properties)).toEqual([
      'title',
      'body',
    ]);

    // Sign the exact contract the executor handed to the SDK.
    const privateKey = PrivateKey.fromHex(THROWAWAY_HEX, 'testnet');
    const publicKey = privateKey.getPublicKey();
    const identityKey = new IdentityPublicKey({
      keyId: 1,
      purpose: 'authentication',
      securityLevel: 'critical',
      keyType: 'ecdsa_secp256k1',
      data: publicKey.toBytes(),
    });
    const transition = new DataContractUpdateTransition(submitted, 2n, platformVersion);
    const stateTransition = transition.toStateTransition();
    expect(stateTransition.sign(privateKey, identityKey).length).toBeGreaterThan(0);
    const decoded = DataContractUpdateTransition.fromStateTransition(
      stateTransition,
    ).getDataContract(true, platformVersion);
    expect(decoded.version).toBe(2);
    expect(decoded.toJSON(platformVersion).schemaDefs).toEqual(json.schemaDefs);
    expect(stateTransition.hash(false)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects removing definitions that the schemas still reference before submitting', async () => {
    const update = vi.fn();
    await expect(
      executeContractUpdate({
        sdk: {
          version: vi.fn().mockResolvedValue(platformVersion),
          contracts: { fetch: vi.fn().mockResolvedValue(onChainContract()), update },
        } as never,
        signer: createMockSigner({
          identityId: OWNER,
          prepareSdk: vi.fn().mockResolvedValue(createSigningMaterial({ identityId: OWNER })),
        }),
        options: {
          contractId: 'contract',
          documentSchemas: onChainContract().schemas,
          definitions: null,
        },
      }),
    ).rejects.toMatchObject({ name: 'OperationNotSubmittedError' });
    expect(update).not.toHaveBeenCalled();
  });
});
