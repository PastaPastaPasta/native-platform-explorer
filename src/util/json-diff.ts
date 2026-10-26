// A small structural diff for JSON-shaped values (contract schemas across
// versions). Objects are compared key by key, arrays index by index; any other
// difference is reported as a change of the leaf at that path.

export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  /** Dotted path, with `[n]` for array indices and `["k"]` for unusual keys. */
  path: string;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
}

const PLAIN_KEY = /^[A-Za-z_$][\w$]*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  if (PLAIN_KEY.test(key)) return path ? `${path}.${key}` : key;
  return `${path}[${JSON.stringify(key)}]`;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'bigint' || typeof b === 'bigint') return String(a) === String(b);
  // Byte fields (identifiers, hashes) are compared, and reported, as one value.
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return Object.is(a, b);
}

export function diffJson(before: unknown, after: unknown, path = ''): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(before, after, path, out);
  return out;
}

function walk(before: unknown, after: unknown, path: string, out: DiffEntry[]): void {
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const next = join(path, key);
      if (!(key in after)) out.push({ path: next, kind: 'removed', before: before[key] });
      else if (!(key in before)) out.push({ path: next, kind: 'added', after: after[key] });
      else walk(before[key], after[key], next, out);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) {
      const next = join(path, i);
      if (i >= after.length) out.push({ path: next, kind: 'removed', before: before[i] });
      else if (i >= before.length) out.push({ path: next, kind: 'added', after: after[i] });
      else walk(before[i], after[i], next, out);
    }
    return;
  }
  if (!same(before, after)) out.push({ path: path || '(root)', kind: 'changed', before, after });
}

export function summarizeDiff(entries: DiffEntry[]): Record<DiffKind, number> {
  const counts: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0 };
  for (const e of entries) counts[e.kind]++;
  return counts;
}
