import type { KeySelectionCriteria, SignerKeyDescriptor } from './types';
import { SignerUnavailableError } from './types';

const PURPOSES = [
  'AUTHENTICATION',
  'ENCRYPTION',
  'DECRYPTION',
  'TRANSFER',
  'SYSTEM',
  'VOTING',
  'OWNER',
];
const SECURITY_LEVELS = ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'];

function enumName(value: string | number | undefined, names: string[]): string | undefined {
  return typeof value === 'number' ? names[value] : value?.toUpperCase();
}

export function keyMeetsCriteria(
  key: SignerKeyDescriptor,
  criteria?: KeySelectionCriteria,
): boolean {
  if (key.disabledAt !== undefined) return false;
  if (criteria?.keyId !== undefined && key.id !== criteria.keyId) return false;
  if (criteria?.purpose && enumName(key.purpose, PURPOSES) !== criteria.purpose.toUpperCase())
    return false;
  if (criteria?.minSecurityLevel) {
    const rank = SECURITY_LEVELS.indexOf(enumName(key.securityLevel, SECURITY_LEVELS) ?? '');
    if (rank < 0 || rank > SECURITY_LEVELS.indexOf(criteria.minSecurityLevel)) return false;
  }
  return true;
}

export function selectSigningKey<T extends SignerKeyDescriptor>(
  keys: T[],
  criteria?: KeySelectionCriteria,
): T {
  const eligible = keys.filter((key) => keyMeetsCriteria(key, criteria));
  eligible.sort((a, b) => {
    const rank = (key: SignerKeyDescriptor) => {
      const value = SECURITY_LEVELS.indexOf(enumName(key.securityLevel, SECURITY_LEVELS) ?? '');
      return value < 0 ? Number.MAX_SAFE_INTEGER : value;
    };
    return rank(a) - rank(b) || a.id - b.id;
  });
  const selected = eligible[0];
  if (!selected) {
    throw new SignerUnavailableError(
      `No enabled matching on-chain key satisfies ${criteria?.purpose ?? 'the requested purpose'}` +
        `${criteria?.minSecurityLevel ? ` at ${criteria.minSecurityLevel} security or stronger` : ''}` +
        `${criteria?.keyId !== undefined ? ` (key ${criteria.keyId})` : ''}. Connect a signer with an eligible key.`,
    );
  }
  return selected;
}
