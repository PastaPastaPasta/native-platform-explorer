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

function purposes(criteria: KeySelectionCriteria): string[] {
  const purpose = criteria.purpose ?? [];
  return (Array.isArray(purpose) ? purpose : [purpose]).map((name) => name.toUpperCase());
}

/** Human-readable purpose list for error messages, e.g. "TRANSFER or OWNER". */
export function describePurpose(criteria?: KeySelectionCriteria): string | undefined {
  return criteria?.purpose ? purposes(criteria).join(' or ') : undefined;
}

function withinBounds(key: SignerKeyDescriptor, criteria?: KeySelectionCriteria): boolean {
  const bounds = key.contractBounds;
  if (!bounds) return true;
  const target = criteria?.target;
  return (
    target?.contractId === bounds.contractId &&
    (bounds.documentType === undefined || bounds.documentType === target.documentType)
  );
}

/**
 * `ignoreContractBounds` is only for capability previews, where the target
 * contract is not known yet; signing always enforces bounds.
 */
export function keyMeetsCriteria(
  key: SignerKeyDescriptor,
  criteria?: KeySelectionCriteria,
  { ignoreContractBounds = false }: { ignoreContractBounds?: boolean } = {},
): boolean {
  if (key.disabledAt !== undefined) return false;
  if (!ignoreContractBounds && !withinBounds(key, criteria)) return false;
  if (criteria?.keyId !== undefined && key.id !== criteria.keyId) return false;
  if (
    criteria?.purpose &&
    !purposes(criteria).includes(enumName(key.purpose, PURPOSES) ?? '')
  )
    return false;
  if (
    criteria?.allowedSecurityLevels &&
    !criteria.allowedSecurityLevels.some(
      (level) => level === enumName(key.securityLevel, SECURITY_LEVELS),
    )
  )
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
      `No enabled matching on-chain key satisfies ${describePurpose(criteria) ?? 'the requested purpose'}` +
        `${criteria?.minSecurityLevel ? ` at ${criteria.minSecurityLevel} security or stronger` : ''}` +
        `${criteria?.allowedSecurityLevels ? ` (allowed levels: ${criteria.allowedSecurityLevels.join(', ')})` : ''}` +
        `${criteria?.keyId !== undefined ? ` (key ${criteria.keyId})` : ''}` +
        `${criteria?.target ? ` that may be used for contract ${criteria.target.contractId}` : ''}. Connect a signer with an eligible key.`,
    );
  }
  return selected;
}
