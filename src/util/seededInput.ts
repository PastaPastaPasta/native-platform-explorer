import { isBase58Identifier, looksLikeDpnsName } from './identifier';
import { normaliseDpnsName } from './dpns';

export interface SeededEntry {
  raw: string;
  kind: 'identifier' | 'dpns' | 'invalid';
  value: string;
}

/** Parse a textarea blob of newline/comma-separated IDs + DPNS names into
 *  typed entries. Keeps ordering and removes duplicates. */
export function parseSeededInput(input: string): SeededEntry[] {
  const seen = new Set<string>();
  const out: SeededEntry[] = [];
  const parts = input.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  for (const raw of parts) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    if (isBase58Identifier(raw)) {
      out.push({ raw, kind: 'identifier', value: raw });
      continue;
    }
    if (looksLikeDpnsName(raw)) {
      out.push({ raw, kind: 'dpns', value: normaliseDpnsName(raw) });
      continue;
    }
    out.push({ raw, kind: 'invalid', value: raw });
  }
  return out;
}
