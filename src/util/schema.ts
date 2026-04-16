// Helpers for introspecting Dash Platform JSON Schemas to drive the
// `/contract/[id]/documents/[type]` browser.

export interface SchemaIndex {
  name: string;
  properties: Array<{ field: string; order: 'asc' | 'desc' }>;
  unique?: boolean;
}

export interface HeuristicColumn {
  key: string;
  label: string;
  kind: 'identifier' | 'scalar' | 'json';
}

type Schema = Record<string, unknown> | undefined;

export function getDocumentTypeSchema(
  contractSchema: unknown,
  type: string,
): Schema {
  if (!contractSchema || typeof contractSchema !== 'object') return undefined;
  const outer = contractSchema as Record<string, unknown>;
  // Contracts expose document types under `documentSchemas` | `documents` | `documentTypes`.
  const doc =
    (outer.documentSchemas as Schema)?.[type] ??
    (outer.documents as Schema)?.[type] ??
    (outer.documentTypes as Schema)?.[type];
  if (!doc || typeof doc !== 'object') return undefined;
  return doc as Schema;
}

export function getIndicesForType(docSchema: Schema): SchemaIndex[] {
  if (!docSchema) return [];
  const raw = (docSchema.indices ?? docSchema.$indices ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const name = String(e.name ?? e.id ?? '');
      const props = Array.isArray(e.properties) ? e.properties : [];
      const properties = props
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const [field, order] = Object.entries(p as Record<string, unknown>)[0] ?? [];
          if (!field) return null;
          return {
            field,
            order: order === 'desc' ? ('desc' as const) : ('asc' as const),
          };
        })
        .filter(Boolean) as SchemaIndex['properties'];
      if (!name || properties.length === 0) return null;
      return { name, properties, unique: e.unique === true };
    })
    .filter(Boolean) as SchemaIndex[];
}

/** Columns we'll render in the browse table. Always: $id, $ownerId. Plus up to
 *  three additional schema-declared properties so the rows have something to look at. */
export function heuristicColumnsForType(docSchema: Schema): HeuristicColumn[] {
  const cols: HeuristicColumn[] = [
    { key: '$id', label: 'ID', kind: 'identifier' },
    { key: '$ownerId', label: 'Owner', kind: 'identifier' },
  ];
  if (!docSchema) return cols;
  const props = (docSchema.properties as Record<string, unknown> | undefined) ?? {};
  let added = 0;
  for (const [key, def] of Object.entries(props)) {
    if (added >= 3) break;
    if (!def || typeof def !== 'object') continue;
    const t = (def as { type?: string }).type;
    if (t === 'string' || t === 'number' || t === 'integer' || t === 'boolean') {
      cols.push({ key, label: key, kind: 'scalar' });
      added += 1;
    } else if (t === 'object' || t === 'array') {
      cols.push({ key, label: key, kind: 'json' });
      added += 1;
    }
  }
  return cols;
}

/** Drive's query engine requires `where` filter fields to form the leftmost
 *  ordered prefix of an index's property list — you cannot filter on the 2nd
 *  property without also filtering on the 1st. We validate that exact rule
 *  here so the browser UI surfaces the real constraint before round-tripping
 *  to DAPI. */
export function validateWhereAgainstIndices(
  whereFields: string[],
  indices: SchemaIndex[],
): { valid: boolean; matchedIndex?: string; suggestions: SchemaIndex[] } {
  if (whereFields.length === 0) return { valid: true, suggestions: indices };
  const whereSet = new Set(whereFields);
  for (const idx of indices) {
    const idxFields = idx.properties.map((p) => p.field);
    if (whereFields.length > idxFields.length) continue;
    const prefix = idxFields.slice(0, whereFields.length);
    // Every prefix field must be covered by the active filters, and the active
    // filters must not exceed the prefix (we already gated by length above).
    const matches =
      whereFields.length === prefix.length && prefix.every((f) => whereSet.has(f));
    if (matches) {
      return { valid: true, matchedIndex: idx.name, suggestions: indices };
    }
  }
  return { valid: false, suggestions: indices };
}
