import { idToString, readProp } from './sdk-shape';

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

export interface DpnsDomainRow {
  /** Document ID: the `startAfter` cursor for the next page. */
  docId?: string;
  /** Display name, e.g. `Alice.dash`. */
  fqdn: string;
  /** Normalized name used in /dpns links, e.g. `a11ce.dash`. */
  normalizedFqdn: string;
  ownerId?: string;
}

/** Rows from a `domain` documents.query result (Map or array of documents). */
export function dpnsDomainRows(data: unknown): DpnsDomainRow[] {
  const docs = data instanceof Map ? [...data.values()] : Array.isArray(data) ? data : [];
  const rows: DpnsDomainRow[] = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const props = (readProp<Record<string, unknown>>(doc, 'properties') as Record<string, unknown> | undefined) ?? {};
    const label = (props.label as string | undefined) ?? (props.normalizedLabel as string | undefined) ?? '';
    if (!label) continue;
    const records = props.records as Record<string, unknown> | undefined;
    rows.push({
      docId: idToString(readProp(doc, 'id')) ?? idToString(readProp(doc, '$id')),
      fqdn: `${label}.dash`,
      normalizedFqdn: `${(props.normalizedLabel as string | undefined) ?? label.toLowerCase()}.dash`,
      ownerId: idToString(records?.identity) ?? idToString(readProp(doc, 'ownerId')),
    });
  }
  return rows;
}
