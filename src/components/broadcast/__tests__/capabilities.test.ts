import { describe, expect, it } from 'vitest';
import { createMockSigner } from '@/test/signer';
import { keyMeetsCriteria, selectSigningKey } from '@/signer/keys';
import {
  documentSecurityLevels,
  operationRequirement,
  resolveOperationCapability,
  signsInForm,
  resolveSigningCriteria,
  tokenKeyCriteria,
} from '../capabilities';
import { TOKEN_OPERATION_KINDS, tokenOperationId } from '../tokens/options';

const AUTH = { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH' };

describe('operation capabilities', () => {
  it('needs no connected signer for operations signed with keys from the form', () => {
    expect(operationRequirement('unimplemented.operation').status).toBe('unsupported');
    for (const id of [
      'identity.create',
      'identity.topUp',
      'addresses.transfer',
      'addresses.topUpIdentity',
      'addresses.withdraw',
      'addresses.fundFromAssetLock',
      'addresses.createIdentity',
      'voting.castVote',
      'stateTransitions.broadcast',
    ]) {
      const requirement = operationRequirement(id);
      expect(signsInForm(requirement), id).toBe(true);
      expect(resolveOperationCapability(requirement, null, []).status, id).toBe('available');
    }
    // Funding addresses from an identity is signed by its transfer key.
    const fromIdentity = operationRequirement('addresses.transferFromIdentity');
    expect(signsInForm(fromIdentity)).toBe(false);
    expect(resolveOperationCapability(fromIdentity, null, []).status).toBe('requires-another-signer');
    expect(
      resolveOperationCapability(fromIdentity, createMockSigner(), [
        { id: 3, purpose: 'TRANSFER', securityLevel: 'CRITICAL' },
      ]).status,
    ).toBe('available');
  });

  it('requires SDK signing support and an operation-eligible key', () => {
    const requirement = operationRequirement('document.create');
    expect(
      resolveOperationCapability(requirement, createMockSigner({ prepareSdk: undefined }), [AUTH])
        .status,
    ).toBe('requires-another-signer');
    expect(resolveOperationCapability(requirement, createMockSigner(), [AUTH]).status).toBe(
      'available',
    );
    expect(
      resolveOperationCapability(
        operationRequirement('identity.creditTransfer'),
        createMockSigner(),
        [AUTH],
      ).status,
    ).toBe('requires-another-signer');
    expect(
      resolveOperationCapability(operationRequirement('identity.updateKeys'), createMockSigner(), [
        AUTH,
      ]).status,
    ).toBe('requires-another-signer');
  });

  it('rejects disabled or unknown-security keys including explicit IDs', () => {
    expect(keyMeetsCriteria({ ...AUTH, disabledAt: 0n }, { keyId: 1 })).toBe(false);
    expect(
      keyMeetsCriteria({ ...AUTH, securityLevel: 'UNKNOWN' }, { minSecurityLevel: 'HIGH' }),
    ).toBe(false);
    expect(keyMeetsCriteria(AUTH, { keyId: 1, purpose: 'TRANSFER' })).toBe(false);
    expect(() => selectSigningKey([AUTH], { purpose: 'TRANSFER' })).toThrow(/No enabled matching/);
  });

  it('accepts numeric SDK enums and prefers the strongest eligible key deterministically', () => {
    const master = { id: 2, purpose: 0, securityLevel: 0 };
    expect(
      selectSigningKey([AUTH, master], { purpose: 'AUTHENTICATION', minSecurityLevel: 'HIGH' }),
    ).toBe(master);
    expect(keyMeetsCriteria({ id: 3, purpose: 3, securityLevel: 2 }, { purpose: 'TRANSFER' })).toBe(
      true,
    );
    const critical = { id: 5, purpose: 0, securityLevel: 1 };
    expect(
      selectSigningKey(
        [master, critical, AUTH],
        operationRequirement('contract.register').criteria,
      ),
    ).toBe(critical);
    expect(keyMeetsCriteria(master, operationRequirement('contract.register').criteria)).toBe(
      false,
    );
    expect(keyMeetsCriteria(AUTH, operationRequirement('contract.update').criteria)).toBe(false);
    expect(
      keyMeetsCriteria(
        { id: 3, purpose: 3, securityLevel: 2 },
        operationRequirement('identity.creditTransfer').criteria,
      ),
    ).toBe(false);
  });

  it('accepts CRITICAL transfer or owner keys for withdrawals', () => {
    const criteria = operationRequirement('identity.creditWithdrawal').criteria;
    for (const purpose of ['TRANSFER', 'OWNER'])
      expect(keyMeetsCriteria({ id: 1, purpose, securityLevel: 'CRITICAL' }, criteria)).toBe(true);
    expect(
      keyMeetsCriteria({ id: 1, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL' }, criteria),
    ).toBe(false);
    expect(keyMeetsCriteria({ id: 1, purpose: 'OWNER', securityLevel: 'HIGH' }, criteria)).toBe(false);
    expect(resolveOperationCapability(operationRequirement('identity.creditWithdrawal'), createMockSigner(), [AUTH]).reason).toMatch(
      /TRANSFER or OWNER key/,
    );
  });

  it('keeps contract-bound keys inside their contract and document type', () => {
    const auth = { purpose: 'AUTHENTICATION', allowedSecurityLevels: ['HIGH' as const] };
    const boundToX = { id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', contractBounds: { contractId: 'X' } };
    const boundToNote = { ...boundToX, id: 3, contractBounds: { contractId: 'X', documentType: 'note' } };
    expect(keyMeetsCriteria(boundToX, { ...auth, target: { contractId: 'X', documentType: 'note' } })).toBe(true);
    expect(keyMeetsCriteria(boundToX, { ...auth, target: { contractId: 'Y', documentType: 'note' } })).toBe(false);
    expect(keyMeetsCriteria(boundToX, auth)).toBe(false);
    expect(keyMeetsCriteria(boundToNote, { ...auth, target: { contractId: 'X', documentType: 'note' } })).toBe(true);
    expect(keyMeetsCriteria(boundToNote, { ...auth, target: { contractId: 'X', documentType: 'post' } })).toBe(false);
    expect(keyMeetsCriteria(boundToNote, { ...auth, target: { contractId: 'X' } })).toBe(false);
    expect(() => selectSigningKey([boundToX], { ...auth, target: { contractId: 'Y' } })).toThrow(
      /may be used for contract Y/,
    );
    // Before the target is known, a bound key still shows the operation as possible.
    expect(
      resolveOperationCapability(operationRequirement('document.create'), createMockSigner(), [boundToX]).status,
    ).toBe('available');
  });

  it('maps document signatureSecurityLevelRequirement to the levels Platform accepts', () => {
    expect(documentSecurityLevels(undefined)).toEqual(['CRITICAL', 'HIGH']);
    expect(documentSecurityLevels(1n)).toEqual(['CRITICAL']);
    expect(documentSecurityLevels(3n)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
    expect(documentSecurityLevels(2)).toEqual(['CRITICAL', 'HIGH']);
    expect(() => documentSecurityLevels(0n)).toThrow(/requires MASTER keys/);
    expect(() => documentSecurityLevels(4n)).toThrow(/Unsupported/);
    expect(() => documentSecurityLevels('2')).toThrow(/Unsupported/);
  });

  describe('token transitions (Platform v5.0.0-rc.8 batch rules)', () => {
    const key = (purpose: string, securityLevel: string, extra = {}) => ({ id: 1, purpose, securityLevel, ...extra });

    it.each(TOKEN_OPERATION_KINDS.map((kind) => [kind]))('%s accepts only CRITICAL keys', (kind) => {
      const criteria = operationRequirement(tokenOperationId(kind)).criteria;
      expect(operationRequirement(tokenOperationId(kind)).status).toBe('available');
      expect(keyMeetsCriteria(key('AUTHENTICATION', 'CRITICAL'), criteria)).toBe(true);
      // Token actions raise a batch's requirement to CRITICAL: HIGH, MEDIUM and MASTER fail.
      for (const level of ['MASTER', 'HIGH', 'MEDIUM'])
        expect(keyMeetsCriteria(key('AUTHENTICATION', level), criteria)).toBe(false);
      for (const purpose of ['ENCRYPTION', 'DECRYPTION', 'VOTING', 'OWNER', 'SYSTEM'])
        expect(keyMeetsCriteria(key(purpose, 'CRITICAL'), criteria)).toBe(false);
    });

    it('accepts a TRANSFER key only for a single transfer or claim', () => {
      const transferKey = key('TRANSFER', 'CRITICAL');
      expect(tokenKeyCriteria('token.transfer')?.purpose).toEqual(['AUTHENTICATION', 'TRANSFER']);
      expect(tokenKeyCriteria('token.claim')?.purpose).toEqual(['AUTHENTICATION', 'TRANSFER']);
      for (const kind of TOKEN_OPERATION_KINDS)
        expect(keyMeetsCriteria(transferKey, tokenKeyCriteria(tokenOperationId(kind)))).toBe(
          kind === 'transfer' || kind === 'claim',
        );
      expect(tokenKeyCriteria('document.create')).toBeUndefined();
    });

    it('targets the token contract, so only keys bound to that contract qualify', async () => {
      const criteria = await resolveSigningCriteria('token.mint', {} as never, { contractId: 'X' });
      expect(criteria).toEqual({ purpose: 'AUTHENTICATION', allowedSecurityLevels: ['CRITICAL'], target: { contractId: 'X' } });
      expect(keyMeetsCriteria(key('AUTHENTICATION', 'CRITICAL', { contractBounds: { contractId: 'X' } }), criteria)).toBe(true);
      expect(keyMeetsCriteria(key('AUTHENTICATION', 'CRITICAL', { contractBounds: { contractId: 'Y' } }), criteria)).toBe(false);
      // Keys bound to a document type never sign token transitions.
      expect(
        keyMeetsCriteria(key('AUTHENTICATION', 'CRITICAL', { contractBounds: { contractId: 'X', documentType: 'note' } }), criteria),
      ).toBe(false);
    });

    it('reports what token operations need from the signer', () => {
      expect(resolveOperationCapability(operationRequirement('token.mint'), createMockSigner(), [AUTH]).reason).toMatch(
        /AUTHENTICATION key with CRITICAL security/,
      );
    });
  });
});
