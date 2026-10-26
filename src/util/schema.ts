// Helpers for introspecting Dash Platform JSON Schemas to drive the
// `/contract/documents` browser.

import { normaliseContract, toPlain } from './contract';

export interface SchemaIndex {
  name: string;
  properties: Array<{ field: string; order: 'asc' | 'desc' }>;
  unique?: boolean;
  /** Count fast path (`countable: true | "countable" | "countableAllowingOffset"`, or `averageable`). */
  countable?: boolean;
  /** Range counts over the last property (`rangeCountable`, or `rangeAverageable`). */
  rangeCountable?: boolean;
  /** Integer property summed at this index (`summable`, or `averageable` sugar). */
  summable?: string;
  /** Range sums over the last property (`rangeSummable`, or `rangeAverageable`). */
  rangeSummable?: boolean;
}

/** Document-type-wide aggregate flags for unfiltered COUNT / SUM / AVG. */
export interface DocumentTypeAggregates {
  /** `documentsCountable`, `rangeCountable` or `documentsAverageable`. */
  countable: boolean;
  /** `documentsSummable` or `documentsAverageable`. */
  summable?: string;
}

export interface HeuristicColumn {
  key: string;
  label: string;
  kind: 'identifier' | 'scalar' | 'json';
}

type Schema = Record<string, unknown> | undefined;

/** Accepts any of: a raw DataContract WASM class instance, a plain contract
 *  object, a ContractShape (as returned by normaliseContract), or just the
 *  documentSchemas map itself. Coerces through toPlain so WASM-instance
 *  schemas become readable plain JSON. */
export function getDocumentTypeSchema(contractSchema: unknown, type: string): Schema {
  if (!contractSchema || typeof contractSchema !== 'object') return undefined;

  // If the caller already normalised, prefer that.
  const preNormalised = (contractSchema as { documentSchemas?: unknown }).documentSchemas;

  const schemas =
    (preNormalised && typeof preNormalised === 'object'
      ? (toPlain(preNormalised) as Record<string, unknown>)
      : undefined) ?? normaliseContract(contractSchema).documentSchemas;

  if (!schemas) return undefined;
  const entry = schemas[type];
  if (entry === undefined || entry === null) return undefined;
  const plain = toPlain(entry);
  return plain && typeof plain === 'object' && !Array.isArray(plain)
    ? (plain as Schema)
    : undefined;
}

/** Return the JSON-schema fragment for a single property on a document type,
 *  or undefined if the property isn't declared. Used by the aggregate-results
 *  panel to type-aware-decode GROUP BY keys. */
export function getPropertySchema(
  docSchema: Schema,
  fieldName: string,
): Schema {
  if (!docSchema) return undefined;
  const props = (docSchema.properties as Record<string, unknown> | undefined) ?? {};
  const entry = props[fieldName];
  if (!entry || typeof entry !== 'object') return undefined;
  return entry as Schema;
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
      const averageable = typeof e.averageable === 'string' ? e.averageable : undefined;
      const countable =
        e.countable === true || e.countable === 'countable' || e.countable === 'countableAllowingOffset' || !!averageable;
      const summable = typeof e.summable === 'string' ? e.summable : averageable;
      return {
        name,
        properties,
        unique: e.unique === true,
        ...(countable ? { countable } : {}),
        ...(e.rangeCountable === true || e.rangeAverageable === true ? { rangeCountable: true } : {}),
        ...(summable ? { summable } : {}),
        ...(e.rangeSummable === true || e.rangeAverageable === true ? { rangeSummable: true } : {}),
      };
    })
    .filter(Boolean) as SchemaIndex[];
}

export function getDocumentTypeAggregates(docSchema: Schema): DocumentTypeAggregates {
  if (!docSchema) return { countable: false };
  const averageable = typeof docSchema.documentsAverageable === 'string' ? docSchema.documentsAverageable : undefined;
  const summable = typeof docSchema.documentsSummable === 'string' ? docSchema.documentsSummable : averageable;
  return {
    countable: docSchema.documentsCountable === true || docSchema.rangeCountable === true || !!averageable,
    ...(summable ? { summable } : {}),
  };
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

// ── Query workspace index checks ───────────────────────────────────────
//
// Mirrors Drive's index selection for document queries at protocol version 14
// (rs-dpp `Index::matches_contiguous`, rs-drive `select_best_index` and the
// path-query builders). Confirmed against testnet: a two-sided range on one
// field is accepted; range and `in` fields need a matching ORDER BY; ordering
// by a later index property without filtering the earlier ones is rejected.
// These are warnings — the Platform remains the authority.

export type QueryOperator = '==' | '>' | '>=' | '<' | '<=' | 'between' | 'in' | 'startsWith';

export interface QueryShape {
  where: Array<{ field: string; operator: QueryOperator }>;
  orderBy: Array<{ field: string }>;
}

export interface IndexCheck {
  /** Index the Platform is expected to use; undefined for primary-key queries or when no index fits. */
  matchedIndex?: string;
  /** Precise, user-facing reasons the Platform is likely to reject the query. */
  warnings: string[];
}

export const RANGE_OPERATORS: ReadonlySet<QueryOperator> = new Set<QueryOperator>(['>', '>=', '<', '<=', 'between', 'startsWith']);
/** Drive's MAX_INDEX_DIFFERENCE: at most two unused trailing index properties. */
const MAX_INDEX_DIFFERENCE = 2;

const list = (fields: string[]) => fields.map((f) => `\`${f}\``).join(', ');
const describeIndex = (idx: SchemaIndex) => `${idx.name} (${idx.properties.map((p) => p.field).join(', ')})`;

interface Roles {
  equality: string[];
  rangeField?: string;
  inFields: string[];
  orderBy: string[];
}

function queryRoles(shape: QueryShape, requireOrderBy: boolean): { roles: Roles; warnings: string[] } {
  const warnings: string[] = [];
  const equality = unique(shape.where.filter((w) => w.operator === '==').map((w) => w.field));
  const inFields = unique(shape.where.filter((w) => w.operator === 'in').map((w) => w.field));
  const rangeFields = unique(shape.where.filter((w) => RANGE_OPERATORS.has(w.operator)).map((w) => w.field));
  const orderBy = shape.orderBy.map((o) => o.field);

  if (rangeFields.length > 1) {
    warnings.push(
      `Only one field can use range filters (<, <=, >, >=, BETWEEN, STARTS WITH); this query uses ${list(rangeFields)}.`,
    );
  }
  for (const field of rangeFields) {
    const ops = shape.where.filter((w) => w.field === field && RANGE_OPERATORS.has(w.operator)).map((w) => w.operator);
    const lower = ops.filter((op) => op === '>' || op === '>=').length;
    const upper = ops.filter((op) => op === '<' || op === '<=').length;
    const whole = ops.length - lower - upper;
    if (lower > 1 || upper > 1 || (whole > 0 && ops.length > 1)) {
      warnings.push(
        `\`${field}\` has conflicting range filters. Use at most one lower bound and one upper bound, or a single BETWEEN or STARTS WITH.`,
      );
    }
  }
  if (requireOrderBy) {
    for (const field of [...rangeFields, ...inFields]) {
      // `$id` is served by the primary key tree, which needs no ORDER BY.
      if (field === '$id' || orderBy.includes(field)) continue;
      const kind = rangeFields.includes(field) ? 'range filter' : 'IN filter';
      warnings.push(`The ${kind} on \`${field}\` needs ORDER BY ${field}; Platform requires ordering on every range and IN field.`);
    }
  }
  for (const field of equality) {
    if (rangeFields.includes(field) || inFields.includes(field)) {
      warnings.push(`\`${field}\` is filtered with = and with another operator; use one filter per field.`);
    }
  }
  return { roles: { equality, rangeField: rangeFields[0], inFields, orderBy }, warnings };
}

function unique(fields: string[]): string[] {
  return Array.from(new Set(fields));
}

/** Why `index` cannot serve the query, or null when it can. */
function indexMismatch(index: SchemaIndex, roles: Roles): string | null {
  const props = index.properties.map((p) => p.field);
  const { equality, rangeField, inFields, orderBy } = roles;
  const named = unique([...equality, ...(rangeField ? [rangeField] : []), ...inFields, ...orderBy]);
  const missing = named.filter((f) => !props.includes(f));
  if (missing.length) return `it does not include ${list(missing)}`;

  const leading = props.slice(0, equality.length);
  if (!leading.every((f) => equality.includes(f))) {
    return `equality filters must cover its first ${equality.length === 1 ? 'property' : `${equality.length} properties`} (${list(leading)})`;
  }
  const next = [rangeField, inFields.length === 1 ? inFields[0] : undefined].filter((f): f is string => !!f);
  const positions = next.map((f) => props.indexOf(f)).sort((a, b) => a - b);
  if (positions.some((pos, i) => pos !== equality.length + i)) {
    return `${list(next)} must be the ${next.length === 1 ? 'property' : 'properties'} right after the equality-filtered ones (${list(props.slice(equality.length, equality.length + next.length))})`;
  }
  if (inFields.length === 1 && !props.slice(-2).includes(inFields[0]!)) {
    return `IN is only allowed on its last two properties (${list(props.slice(-2))})`;
  }
  if (orderBy.length) {
    // Drive trims trailing properties until the index ends with the ORDER BY
    // run; every field the query names must sit inside what remains.
    let end = -1;
    for (let k = props.length; k >= orderBy.length && end === -1; k--) {
      if (orderBy.every((f, j) => props[k - orderBy.length + j] === f)) end = k - 1;
    }
    if (end === -1) return `ORDER BY must list consecutive properties in index order (${list(props)})`;
    const after = named.filter((f) => props.indexOf(f) > end);
    if (after.length) return `ORDER BY must continue through ${list(after)}, which the query also uses`;
  }
  const prefix = props.slice(0, named.length);
  if (!prefix.every((f) => named.includes(f))) {
    const gap = prefix.find((f) => !named.includes(f))!;
    return `\`${gap}\` comes before ${list(named.filter((f) => props.indexOf(f) > props.indexOf(gap)))} and must be filtered first`;
  }
  if (props.length - named.length > MAX_INDEX_DIFFERENCE) {
    return `the query uses ${named.length} of its ${props.length} properties; at most ${MAX_INDEX_DIFFERENCE} may be left unused`;
  }
  return null;
}

/** Check a SELECT * query against the document type's indices. */
export function checkQueryAgainstIndices(shape: QueryShape, indices: SchemaIndex[]): IndexCheck {
  const { roles, warnings } = queryRoles(shape, true);
  const fields = unique([...shape.where.map((w) => w.field), ...roles.orderBy]);
  // Unfiltered queries and `$id` lookups use the primary key tree.
  if (fields.every((f) => f === '$id') && !roles.rangeField) return { warnings };

  const candidates = indices.map((index) => ({ index, reason: indexMismatch(index, roles) }));
  const match = candidates.find((c) => c.reason === null);
  if (match) return { matchedIndex: match.index.name, warnings };
  if (indices.length === 0) {
    return { warnings: [...warnings, 'This document type declares no indices, so it can only be listed by $id.'] };
  }
  const related = candidates.filter((c) => c.index.properties.some((p) => fields.includes(p.field)));
  const shown = (related.length ? related : candidates).slice(0, 3);
  return {
    warnings: [
      ...warnings,
      `No index supports this filter and ORDER BY combination. ${shown.map((c) => `${describeIndex(c.index)}: ${c.reason}.`).join(' ')}`,
    ],
  };
}

export type AggregateSelect = 'count' | 'sum' | 'avg';

/**
 * Check an aggregate against the count/sum index flags. Drive needs a
 * `countable` index whose properties are exactly the filtered fields, a
 * `rangeCountable` index whose last property carries the range, or the
 * document-type flag for an unfiltered total. SUM uses `summable: "<field>"`
 * the same way, and AVG needs both.
 */
export function checkAggregateAgainstIndices(
  shape: QueryShape,
  select: AggregateSelect,
  field: string | undefined,
  indices: SchemaIndex[],
  docType: DocumentTypeAggregates,
): IndexCheck {
  // Aggregates walk in ascending order when ORDER BY is omitted.
  const { roles, warnings } = queryRoles(shape, false);
  const needsCount = select !== 'sum';
  const needsSum = select !== 'count';
  const requirement = [needsCount ? 'countable' : '', needsSum ? `summable: "${field ?? '?'}"` : ''].filter(Boolean).join(' and ');
  const pointFields = unique([...roles.equality, ...roles.inFields]);

  if (pointFields.length === 0 && !roles.rangeField) {
    const ok = (!needsCount || docType.countable) && (!needsSum || docType.summable === field);
    if (ok) return { warnings };
    const flag = select === 'count' ? 'documentsCountable: true' : select === 'sum' ? `documentsSummable: "${field}"` : `documentsAverageable: "${field}"`;
    return { warnings: [...warnings, `An unfiltered ${select.toUpperCase()} needs \`${flag}\` on the document type, which it does not declare.`] };
  }

  const fits = (idx: SchemaIndex, range: boolean) =>
    (!needsCount || (range ? idx.rangeCountable : idx.countable)) && (!needsSum || (idx.summable === field && (!range || idx.rangeSummable)));
  const props = (idx: SchemaIndex) => idx.properties.map((p) => p.field);
  const match = roles.rangeField
    ? indices.find((idx) => {
        const p = props(idx);
        return fits(idx, true) && p[p.length - 1] === roles.rangeField && p.length - 1 === pointFields.length && pointFields.every((f) => p.slice(0, -1).includes(f));
      })
    : indices.find((idx) => {
        // Exactly the filtered fields, or a range index with one more trailing property.
        const p = props(idx);
        const covers = (n: number) => p.slice(0, n).every((f) => pointFields.includes(f));
        return (fits(idx, false) && p.length === pointFields.length && covers(p.length))
          || (fits(idx, true) && p.length === pointFields.length + 1 && covers(pointFields.length));
      });
  if (match) return { matchedIndex: match.name, warnings };

  const flagged = indices.filter((idx) => fits(idx, !!roles.rangeField));
  const where = list([...pointFields, ...(roles.rangeField ? [roles.rangeField] : [])]);
  const hint = flagged.length
    ? ` Indices with those flags: ${flagged.map(describeIndex).join('; ')}.`
    : ` This document type has no ${roles.rangeField ? `range ${requirement}` : requirement} index.`;
  return {
    warnings: [
      ...warnings,
      roles.rangeField
        ? `A ${select.toUpperCase()} with a range on \`${roles.rangeField}\` needs a range ${requirement} index whose last property is \`${roles.rangeField}\` and whose other properties are the filtered fields (${where}).${hint}`
        : `A filtered ${select.toUpperCase()} needs a ${requirement} index whose properties are exactly the filtered fields (${where}).${hint}`,
    ],
  };
}
