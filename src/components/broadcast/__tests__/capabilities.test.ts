import { describe, expect, it } from 'vitest';
import { createMockSigner } from '@/test/signer';
import { keyMeetsCriteria, selectSigningKey } from '@/signer/keys';
import {
  documentSecurityLevels,
  operationRequirement,
  resolveOperationCapability,
} from '../capabilities';

const AUTH = { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH' };

describe('operation capabilities', () => {
  it('exposes external and unsupported flows before connecting a signer', () => {
    expect(
      resolveOperationCapability(operationRequirement('identity.topUp'), null, []).status,
    ).toBe('external-bridge');
    expect(operationRequirement('unimplemented.operation').status).toBe('unsupported');
    expect(
      resolveOperationCapability(operationRequirement('stateTransitions.broadcast'), null, [])
        .status,
    ).toBe('unsupported');
    expect(
      resolveOperationCapability(operationRequirement('voting.castVote'), null, []).status,
    ).toBe('unsupported');
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
});
