import { describe, expect, it } from 'vitest';
import { parseBridgeBackup } from '../backup';

const VALID_ID = '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr';

describe('parseBridgeBackup', () => {
  it('parses a well-formed create backup', () => {
    const out = parseBridgeBackup({
      network: 'testnet',
      mode: 'create',
      identityId: VALID_ID,
      identityKeys: [
        {
          id: 0,
          purpose: 'AUTHENTICATION',
          securityLevel: 'MASTER',
          keyType: 'ECDSA_HASH160',
          privateKeyWif: 'cV...',
        },
        {
          id: 1,
          purpose: 'AUTHENTICATION',
          securityLevel: 'HIGH',
          keyType: 'ECDSA_HASH160',
          privateKeyWif: 'cV...',
        },
      ],
    });
    expect(out.identityId).toBe(VALID_ID);
    expect(out.network).toBe('testnet');
    expect(out.keys).toHaveLength(2);
    expect(out.keys[0]?.purpose).toBe('AUTHENTICATION');
  });

  it('rejects a top-up backup (no identity keys)', () => {
    expect(() =>
      parseBridgeBackup({
        network: 'testnet',
        mode: 'topup',
        targetIdentityId: VALID_ID,
      }),
    ).toThrow(/top-up/);
  });

  it('rejects an invalid identity id', () => {
    expect(() =>
      parseBridgeBackup({
        identityId: 'not-a-real-id',
        identityKeys: [{ id: 0, purpose: 'X', securityLevel: 'X', privateKeyWif: 'x' }],
      }),
    ).toThrow(/identityId/);
  });

  it('rejects when keys are missing', () => {
    expect(() =>
      parseBridgeBackup({ identityId: VALID_ID, identityKeys: [] }),
    ).toThrow(/identityKeys/);
  });

  it('rejects a key without a WIF', () => {
    expect(() =>
      parseBridgeBackup({
        identityId: VALID_ID,
        identityKeys: [
          {
            id: 0,
            purpose: 'AUTHENTICATION',
            securityLevel: 'HIGH',
          },
        ],
      }),
    ).toThrow(/privateKeyWif/);
  });

  it('rejects non-object input', () => {
    expect(() => parseBridgeBackup('hello')).toThrow();
    expect(() => parseBridgeBackup(null)).toThrow();
    expect(() => parseBridgeBackup([])).toThrow();
  });
});
