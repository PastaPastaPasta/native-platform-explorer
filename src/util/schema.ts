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
// Mirrors Drive's index selection for document queries. Up to protocol
// version 13 (Platform 4.x, which the pinned SDK 4.0.0-rc.2 is built from,
// and mainnet as of 2026-10) Drive uses rs-dpp `Index::matches`: after the
// index is trimmed to end with the ORDER BY run, every field the query names
// must sit inside it, an IN must be on one of the last two properties, and at
// most two properties may go unused. Unfiltered middle properties are walked
// by subqueries, so `status == 1 ORDER BY $updatedAt` on
// [status, pooling, coreFeePerByte, $updatedAt] is accepted (Drive's own
// withdrawal pooling issues it). Protocol version 14 (Platform 5.x, on
// testnet since 2026-10) adds `Index::matches_contiguous`: equality filters
// must cover the leading properties, the range/IN field must follow them, and
// no unused property may precede a named one. On testnet DPNS,
// `ORDER BY normalizedLabel` without a parent filter is rejected, while
// mainnet returns documents. Range and IN fields need ORDER BY on both.
// These are warnings — the Platform remains the authority.

export type QueryOperator = '==' | '>' | '>=' | '<' | '<=' | 'between' | 'in' | 'startsWith';

export interface QueryShape {
  where: Array<{ field: string; operator: QueryOperator; value?: unknown }>;
  orderBy: Array<{ field: string }>;
  groupBy?: string[];
  limit?: number;
}

export interface IndexCheck {
  /** Index the Platform is expected to use; undefined for primary-key queries or when no index fits. */
  matchedIndex?: string;
  /** Precise, user-facing reasons the Platform is likely to reject the query. */
  warnings: string[];
}

export interface IndexCheckOptions {
  /** The network's current Platform protocol version; unknown means the SDK's own (13). */
  protocolVersion?: number;
}

/** First protocol version whose document queries need a contiguous index prefix. */
export const CONTIGUOUS_INDEX_PROTOCOL_VERSION = 14;

export const RANGE_OPERATORS: ReadonlySet<QueryOperator> = new Set<QueryOperator>(['>', '>=', '<', '<=', 'between', 'startsWith']);
/** Drive's MAX_INDEX_DIFFERENCE: at most two unused index properties. */
const MAX_INDEX_DIFFERENCE = 2;
/** Drive's DEFAULT_QUERY_LIMIT, which also caps per-group aggregate entries. */
export const DEFAULT_AGGREGATE_GROUP_LIMIT = 100;
/** MAX_CARRIER_AGGREGATE_OUTER_RANGE_LIMIT: default outer walk of a two-range GROUP BY. */
const CARRIER_OUTER_RANGE_LIMIT = 10;

const list = (fields: string[]) => fields.map((f) => `\`${f}\``).join(', ');
const describeIndex = (idx: SchemaIndex) => `${idx.name} (${idx.properties.map((p) => p.field).join(', ')})`;

interface Roles {
  equality: string[];
  rangeFields: string[];
  inFields: string[];
  orderBy: string[];
}

function queryRoles(shape: QueryShape): Roles {
  return {
    equality: unique(shape.where.filter((w) => w.operator === '==').map((w) => w.field)),
    inFields: unique(shape.where.filter((w) => w.operator === 'in').map((w) => w.field)),
    rangeFields: unique(shape.where.filter((w) => RANGE_OPERATORS.has(w.operator)).map((w) => w.field)),
    orderBy: shape.orderBy.map((o) => o.field),
  };
}

/** WhereClause::group_clauses: per-field clause rules shared by every query kind. */
function clauseWarnings(shape: QueryShape, roles: Roles, checkInCount: boolean): string[] {
  const warnings: string[] = [];
  if (checkInCount && shape.where.filter((w) => w.operator === 'in').length > 1) {
    warnings.push(`Only one IN filter is allowed per query; this query has IN on ${list(roles.inFields)}.`);
  }
  for (const field of roles.rangeFields) {
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
  for (const field of roles.inFields.filter((f) => roles.rangeFields.includes(f))) {
    warnings.push(`\`${field}\` is filtered with IN and with a range; use one filter per field.`);
  }
  for (const field of roles.equality) {
    if (roles.rangeFields.includes(field) || roles.inFields.includes(field)) {
      warnings.push(`\`${field}\` is filtered with = and with another operator; use one filter per field.`);
    } else if (shape.where.filter((w) => w.field === field && w.operator === '==').length > 1) {
      warnings.push(`\`${field}\` has more than one = filter; use one filter per field.`);
    }
  }
  return warnings;
}

function unique(fields: string[]): string[] {
  return Array.from(new Set(fields));
}

/** Fields in the order Drive's `find_best_index` collects them. */
function namedFields({ equality, rangeFields, inFields, orderBy }: Roles): string[] {
  return unique([...equality, ...rangeFields.slice(0, 1), ...inFields.slice(0, 1), ...orderBy]);
}

/**
 * rs-dpp `Index::matches` (protocol ≤ 13): the number of unused properties,
 * or why the index cannot serve the query.
 */
function indexDifference(index: SchemaIndex, roles: Roles): number | string {
  const props = index.properties.map((p) => p.field);
  const names = namedFields(roles);
  const inField = roles.inFields[0];
  const missing = names.filter((f) => !props.includes(f));
  if (missing.length) return `it does not include ${list(missing)}`;
  // Trim trailing properties until the index ends with the ORDER BY run.
  let reduced = props;
  if (roles.orderBy.length) {
    let k = props.length;
    while (k >= roles.orderBy.length && !roles.orderBy.every((f, j) => props[k - roles.orderBy.length + j] === f)) k--;
    if (k < roles.orderBy.length) return `ORDER BY must list consecutive properties in index order (${list(props)})`;
    reduced = props.slice(0, k);
  }
  if (inField && !props.slice(-2).includes(inField)) {
    return `IN is only allowed on its last two properties (${list(props.slice(-2))})`;
  }
  const after = names.filter((f) => !reduced.includes(f));
  if (after.length) return `ORDER BY must continue through ${list(after)}, which the query also uses`;
  return props.length - names.length;
}

/** rs-dpp `Index::matches_contiguous` (protocol ≥ 14): extra placement rules, or null. */
function contiguityMismatch(index: SchemaIndex, roles: Roles): string | null {
  const props = index.properties.map((p) => p.field);
  const { equality, rangeFields, inFields } = roles;
  const names = namedFields(roles);
  const leading = props.slice(0, equality.length);
  if (!leading.every((f) => equality.includes(f))) {
    return `equality filters must cover its first ${equality.length === 1 ? 'property' : `${equality.length} properties`} (${list(leading)})`;
  }
  const next = [rangeFields[0], inFields[0]].filter((f): f is string => !!f);
  const positions = next.map((f) => props.indexOf(f)).sort((a, b) => a - b);
  if (positions.some((pos, i) => pos !== equality.length + i)) {
    return `${list(next)} must be the ${next.length === 1 ? 'property' : 'properties'} right after the equality-filtered ones (${list(props.slice(equality.length, equality.length + next.length))})`;
  }
  const prefix = props.slice(0, names.length);
  const gap = prefix.find((f) => !names.includes(f));
  if (gap) {
    return `\`${gap}\` comes before ${list(names.filter((f) => props.indexOf(f) > props.indexOf(gap)))} and must be filtered first`;
  }
  return null;
}

/** Check a SELECT * query against the document type's indices. */
export function checkQueryAgainstIndices(shape: QueryShape, indices: SchemaIndex[], options: IndexCheckOptions = {}): IndexCheck {
  const contiguous = (options.protocolVersion ?? 0) >= CONTIGUOUS_INDEX_PROTOCOL_VERSION;
  const roles = queryRoles(shape);
  // Protocol 14 groups several IN clauses and decides in the path lowering.
  const warnings = clauseWarnings(shape, roles, !contiguous);
  if (roles.rangeFields.length > 1) {
    warnings.push(
      `Only one field can use range filters (<, <=, >, >=, BETWEEN, STARTS WITH); this query uses ${list(roles.rangeFields)}.`,
    );
  }
  for (const field of [...roles.rangeFields, ...roles.inFields]) {
    // `$id` is served by the primary key tree, which needs no ORDER BY.
    if (field === '$id' || roles.orderBy.includes(field)) continue;
    const kind = roles.rangeFields.includes(field) ? 'range filter' : 'IN filter';
    warnings.push(`The ${kind} on \`${field}\` needs ORDER BY ${field}; Platform requires ordering on every range and IN field.`);
  }
  const fields = unique([...shape.where.map((w) => w.field), ...roles.orderBy]);
  // Unfiltered queries and `$id` lookups use the primary key tree.
  if (fields.every((f) => f === '$id') && !roles.rangeFields.length) return { warnings };
  if (indices.length === 0) {
    return { warnings: [...warnings, 'This document type declares no indices, so it can only be listed by $id.'] };
  }
  // Protocol 14 places several IN fields with its own index search
  // (`find_best_index_for_multiple_in_clauses`), which is not modelled here.
  if (contiguous && roles.inFields.length > 1) return { warnings };

  const candidates = indices.map((index) => {
    const difference = indexDifference(index, roles);
    if (typeof difference === 'string') return { index, reason: difference as string | null, difference: 0 };
    return { index, reason: contiguous ? contiguityMismatch(index, roles) : null, difference };
  });
  // `index_for_types`: the fitting index with the fewest unused properties,
  // ties going to the first by name (Drive keeps indices in a BTreeMap).
  const best = candidates
    .filter((c) => c.reason === null)
    .sort((a, b) => a.difference - b.difference || (a.index.name < b.index.name ? -1 : a.index.name > b.index.name ? 1 : 0))[0];
  if (best && best.difference <= MAX_INDEX_DIFFERENCE) return { matchedIndex: best.index.name, warnings };
  if (best) {
    return {
      warnings: [
        ...warnings,
        `The closest index, ${describeIndex(best.index)}, leaves ${best.difference} properties unused; at most ${MAX_INDEX_DIFFERENCE} may be.`,
      ],
    };
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

/** How Drive serves a GROUP BY (rs-drive-abci `compute_aggregate_mode_and_check_limit`). */
export type AggregateGroupMode = 'aggregate' | 'perIn' | 'range' | 'compound';

/** The GROUP BY mode, or why Platform does not support the GROUP BY. */
export function aggregateGroupMode(shape: QueryShape): AggregateGroupMode | { unsupported: string } {
  const groupBy = shape.groupBy ?? [];
  const { inFields, rangeFields } = queryRoles(shape);
  const isIn = (f: string) => inFields.includes(f);
  const isRange = (f: string) => rangeFields.includes(f);
  if (groupBy.length === 0) return 'aggregate';
  if (groupBy.length === 1) {
    const [field] = groupBy as [string];
    if (isIn(field)) return 'perIn';
    if (isRange(field)) return 'range';
    return { unsupported: `GROUP BY \`${field}\` needs an IN or range filter on \`${field}\`; Platform groups only by filtered values.` };
  }
  if (groupBy.length === 2) {
    const [first, second] = groupBy as [string, string];
    if (isIn(first) && isRange(second)) return 'compound';
    return { unsupported: 'A two-field GROUP BY must name an IN-filtered field, then a range-filtered field.' };
  }
  return { unsupported: 'GROUP BY supports at most two fields.' };
}

/**
 * The most per-group entries Platform returns for a GROUP BY, when that bound
 * can truncate the result. `entriesPerGroup` is how many server entries one
 * displayed row can stand for: with an IN filter, a range GROUP BY returns
 * (in, range) pairs, limited before the SDK merges them by range value.
 * IN groups are bounded by the IN list instead (Drive ignores LIMIT there).
 */
export function aggregateGroupBound(shape: QueryShape): { limit: number; entriesPerGroup: number } | undefined {
  const mode = aggregateGroupMode(shape);
  if (mode !== 'range' && mode !== 'compound') return undefined;
  const inValues = shape.where.find((w) => w.operator === 'in')?.value;
  const entriesPerGroup = Array.isArray(inValues) ? Math.max(1, new Set(inValues.map((v) => JSON.stringify(v))).size) : 1;
  // Two ranges on different fields: the carrier walk stops after 10 outer values by default.
  const carrier = mode === 'range' && queryRoles(shape).rangeFields.length === 2;
  return { limit: shape.limit ?? (carrier ? CARRIER_OUTER_RANGE_LIMIT : DEFAULT_AGGREGATE_GROUP_LIMIT), entriesPerGroup };
}

/**
 * Check an aggregate against Drive 4.0's aggregate rules (rs-drive
 * `detect_mode`, the count/sum index pickers and the abci GROUP BY/LIMIT
 * checks). The SDK requests proofs for every aggregate call, so the prove-path
 * rules apply. Point lookups need a `countable` index whose properties are
 * exactly the filtered fields, ranges a `rangeCountable` index ending in the
 * range field, and unfiltered totals the document-type flag. SUM uses
 * `summable: "<field>"` the same way, and AVG needs both.
 */
export function checkAggregateAgainstIndices(
  shape: QueryShape,
  select: AggregateSelect,
  field: string | undefined,
  indices: SchemaIndex[],
  docType: DocumentTypeAggregates,
): IndexCheck {
  const roles = queryRoles(shape);
  const warnings = clauseWarnings(shape, roles, true);
  const fn = select.toUpperCase();
  const mode = aggregateGroupMode(shape);
  if (typeof mode === 'object') warnings.push(mode.unsupported);
  if (shape.limit !== undefined && (mode === 'aggregate' || mode === 'perIn')) {
    warnings.push(
      mode === 'aggregate'
        ? `LIMIT is not allowed on ${fn} without GROUP BY; the result is a single row.`
        : `LIMIT is not allowed with GROUP BY on an IN field; the IN list already bounds the result, so shorten it instead.`,
    );
  }
  const ranges = roles.rangeFields;
  const hasIn = roles.inFields.length > 0;
  // Only COUNT has the carrier walk; SUM/AVG route a range GROUP BY to the distinct walk.
  const carrier = select === 'count' && ranges.length === 2 && mode === 'range' && !hasIn;
  if (ranges.length > 1 && !carrier) {
    warnings.push(
      `Only one field can use range filters in an aggregate; this query uses ${list(ranges)}. Two ranges on different fields work only for COUNT with GROUP BY one of them and no IN filter.`,
    );
  }
  if (carrier && shape.limit !== undefined && shape.limit > CARRIER_OUTER_RANGE_LIMIT) {
    warnings.push(`A COUNT grouped over two ranges returns at most ${CARRIER_OUTER_RANGE_LIMIT} groups; use LIMIT ${CARRIER_OUTER_RANGE_LIMIT} or less.`);
  }
  if (ranges.length === 1 && hasIn && mode === 'aggregate') {
    warnings.push(`An IN filter with a range filter needs GROUP BY ${roles.inFields[0]} (or GROUP BY ${roles.inFields[0]}, ${ranges[0]}) when proofs are requested.`);
  }
  if (select !== 'count' && docType.summable && field !== docType.summable) {
    warnings.push(`This document type sums \`${docType.summable}\`, so ${fn}(${field ?? '?'}) is rejected.`);
  }

  const needsCount = select !== 'sum';
  const needsSum = select !== 'count';
  const requirement = [needsCount ? 'countable' : '', needsSum ? `summable: "${field ?? '?'}"` : ''].filter(Boolean).join(' and ');
  const pointFields = unique([...roles.equality, ...roles.inFields]);
  const rangeField = carrier ? undefined : ranges[0];

  if (pointFields.length === 0 && ranges.length === 0) {
    const ok = (!needsCount || docType.countable) && (!needsSum || docType.summable === field);
    if (ok) return { warnings };
    const flag = select === 'count' ? 'documentsCountable: true' : select === 'sum' ? `documentsSummable: "${field}"` : `documentsAverageable: "${field}"`;
    return { warnings: [...warnings, `An unfiltered ${fn} needs \`${flag}\` on the document type, which it does not declare.`] };
  }

  const fits = (idx: SchemaIndex, range: boolean) =>
    (!needsCount || (idx.countable && (!range || idx.rangeCountable))) && (!needsSum || (idx.summable === field && (!range || idx.rangeSummable)));
  const props = (idx: SchemaIndex) => idx.properties.map((p) => p.field);
  const outer = shape.groupBy?.[0];
  const match = carrier
    ? // `find_range_countable_index`: one range first, the other last, filtered fields between.
      indices.find((idx) => {
        const p = props(idx);
        return fits(idx, true) && p.length >= 2 && ranges.includes(p[0]!) && ranges.includes(p[p.length - 1]!) && p[0] !== p[p.length - 1]
          && p.slice(1, -1).every((f) => pointFields.includes(f));
      })
    : rangeField
      ? indices.find((idx) => {
          const p = props(idx);
          return fits(idx, true) && p.length === pointFields.length + 1 && p[p.length - 1] === rangeField && p.slice(0, -1).every((f) => pointFields.includes(f));
        })
      : // `find_countable_index`: properties exactly the filtered fields.
        indices.find((idx) => {
          const p = props(idx);
          return fits(idx, false) && p.length === pointFields.length && p.every((f) => pointFields.includes(f));
        });
  if (match && carrier) {
    // The picker checks only the properties between the two ranges, and the
    // walk groups by the index's first property whatever GROUP BY says.
    const p = props(match);
    const ignored = pointFields.filter((f) => !p.includes(f));
    if (ignored.length) warnings.push(`Platform ignores the filter on ${list(ignored)} for this shape, because ${describeIndex(match)} does not include it.`);
    if (p[0] !== outer) warnings.push(`Platform groups this by \`${p[0]}\`, the first property of ${describeIndex(match)}, not by \`${outer}\`.`);
  }
  if (match) return { matchedIndex: match.name, warnings };

  const range = ranges.length > 0;
  const flagged = indices.filter((idx) => fits(idx, range));
  const where = list([...pointFields, ...ranges]);
  const hint = flagged.length
    ? ` Indices with those flags: ${flagged.map(describeIndex).join('; ')}.`
    : ` This document type has no ${range ? `range ${requirement}` : requirement} index.`;
  return {
    warnings: [
      ...warnings,
      carrier
        ? `A ${fn} with ranges on ${list(ranges)} needs a range ${requirement} index that starts with one of them, ends with the other and has only filtered fields in between.${hint}`
        : rangeField
          ? `A ${fn} with a range on \`${rangeField}\` needs a range ${requirement} index whose last property is \`${rangeField}\` and whose other properties are the filtered fields (${where}).${hint}`
          : `A filtered ${fn} needs a ${requirement} index whose properties are exactly the filtered fields (${where}).${hint}`,
    ],
  };
}
