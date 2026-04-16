// Homograph-safe conversion used by DPNS to deduplicate visually-similar labels.
// Matches the SDK's `convertToHomographSafe` semantics (lowercase + o→0, i→1, l→1).

const HOMOGRAPH_MAP: Record<string, string> = {
  o: '0',
  O: '0',
  i: '1',
  I: '1',
  l: '1',
  L: '1',
};

export function convertToHomographSafeChars(label: string): string {
  return label
    .toLowerCase()
    .split('')
    .map((c) => HOMOGRAPH_MAP[c] ?? c)
    .join('');
}

const DPNS_LABEL_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function validateLabel(label: string): { valid: boolean; reason?: string } {
  const s = label.toLowerCase();
  if (!DPNS_LABEL_RE.test(s)) {
    return { valid: false, reason: 'Labels must be 3–63 chars of [a-z0-9-], not starting/ending with -.' };
  }
  return { valid: true };
}

/** Normalise `name` into a `.dash` FQDN when the user omits the TLD. */
export function normaliseDpnsName(name: string): string {
  const s = name.trim().toLowerCase();
  return s.endsWith('.dash') ? s : `${s}.dash`;
}
