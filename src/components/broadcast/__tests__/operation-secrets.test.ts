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
    expect(secretForms).toContain('IdentityUpdateKeysForm');
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
});
