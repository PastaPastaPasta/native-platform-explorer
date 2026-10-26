import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATIONS, findOperationById } from '../operations';

const FORMS_DIR = 'src/components/broadcast/forms';

/** Exported form components whose source collects a secret through SecretInput. */
function formsWithSecretFields(): string[] {
  return readdirSync(FORMS_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx') && !file.includes('__tests__'))
    .map((file) => readFileSync(join(FORMS_DIR, file), 'utf8'))
    .filter((source) => source.includes('<SecretInput'))
    .flatMap((source) =>
      [...source.matchAll(/export (?:function|const) (\w+Form)\b/g)].map((m) => m[1]!),
    );
}

describe('operation secret declarations', () => {
  it.each(OPERATIONS.map((entry) => [entry.id, entry] as const))(
    '%s declares its secrets or that it has none',
    (_, { descriptor }) => {
      const { secrets } = descriptor;
      expect(secrets === 'none' || typeof secrets?.reviewData === 'function').toBe(true);
    },
  );

  it('requires every form with a secret field to declare its secrets', () => {
    const secretForms = formsWithSecretFields();
    expect(secretForms).toEqual(
      expect.arrayContaining([
        'IdentityUpdateKeysForm',
        'IdentityCreateForm',
        'IdentityTopUpForm',
        'AddressTransferForm',
        'AddressTopUpIdentityForm',
        'AddressWithdrawForm',
        'AddressFundFromAssetLockForm',
        'AddressCreateIdentityForm',
        'MasternodeVoteForm',
      ]),
    );
    for (const { id, descriptor } of OPERATIONS) {
      if (secretForms.includes(descriptor.FormComponent.name))
        expect(descriptor.secrets, id).not.toBe('none');
    }
  });

  it('reviews identity key updates without the new private keys', () => {
    const { secrets } = findOperationById('identity.updateKeys')!.descriptor;
    if (secrets === 'none') throw new Error('identity.updateKeys must declare its secrets');
    const view = secrets.reviewData({
      network: 'testnet',
      addKeys: [
        {
          purpose: 'TRANSFER',
          securityLevel: 'CRITICAL',
          keyType: 'ECDSA_HASH160',
          privateKeyWif: 'secret-wif',
        },
      ],
      disableKeyIds: [3],
    });
    expect(JSON.stringify(view)).not.toContain('secret-wif');
  });

  const proof = { proofHex: '00', type: 'chain', outPoint: 'tx:0', identityId: 'new-id' };
  const mnemonicKeys = { kind: 'mnemonic' as const, mnemonic: 'secret-mnemonic', identityIndex: 0 };
  const wifKeys = {
    kind: 'wif' as const,
    keys: [
      {
        purpose: 'AUTHENTICATION' as const,
        securityLevel: 'MASTER' as const,
        privateKeyWif: 'secret-new-key',
      },
    ],
  };
  const address = {
    network: 'testnet',
    inputKeyWif: 'secret-address-key',
    fromAddress: 'tdash1from',
  };
  it.each([
    [
      'identity.create',
      { network: 'testnet', proof, assetLockKeyWif: 'secret-lock', keys: mnemonicKeys },
    ],
    [
      'identity.create',
      { network: 'testnet', proof, assetLockKeyWif: 'secret-lock', keys: wifKeys },
    ],
    [
      'identity.topUp',
      { network: 'testnet', identityId: 'id', proof, assetLockKeyWif: 'secret-lock' },
    ],
    ['addresses.transfer', { ...address, outputs: [], feeFrom: 'sender' }],
    ['addresses.topUpIdentity', { ...address, identityId: 'id', amountCredits: 1n }],
    ['addresses.withdraw', { ...address, amountCredits: 1n, toAddress: 'y', coreFeePerByte: 1 }],
    [
      'addresses.fundFromAssetLock',
      { network: 'testnet', address: 'tdash1to', proof, assetLockKeyWif: 'secret-lock' },
    ],
    ['addresses.createIdentity', { ...address, amountCredits: 1n, keys: mnemonicKeys }],
    [
      'voting.castVote',
      {
        network: 'testnet',
        proTxHash: 'p',
        votingKeyWif: 'secret-voting',
        contractId: 'c',
        documentTypeName: 'd',
        indexName: 'i',
        indexValues: [],
        choice: 'abstain',
      },
    ],
  ])('reviews %s without its private keys', (id, options) => {
    const { secrets, summarise } = findOperationById(id)!.descriptor;
    if (secrets === 'none') throw new Error(`${id} must declare its secrets`);
    const shown = JSON.stringify(secrets.reviewData(options), (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(shown).not.toMatch(/secret/);
    if (!('outputs' in options)) expect(summarise(options)).not.toMatch(/secret/);
  });
});
