// Translate the documents browser's filter rows into a `documents.query`
// `where` / `orderBy` pair, typed against the document type's JSON schema.

import { checkQueryAgainstIndices, type SchemaIndex } from './schema';

export const FILTER_OPERATORS = ['==', '<', '<=', '>', '>=', 'in', 'startsWith'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const RANGE_OPERATORS: ReadonlySet<FilterOperator> = new Set(['<', '<=', '>', '>=', 'startsWith']);

/** One filter row, kept as text so it round-trips through the URL. */
export type DocumentFilter = [field: string, op: FilterOperator, value: string];
export type OrderBy = [field: string, direction: 'asc' | 'desc'];

export type FieldKind = 'string' | 'integer' | 'number' | 'boolean' | 'identifier' | 'other';

type Schema = Record<string, unknown> | undefined;

const SYSTEM_FIELDS: Record<string, FieldKind> = {
  $id: 'identifier',
  $ownerId: 'identifier',
  $createdAt: 'integer',
  $updatedAt: 'integer',
  $transferredAt: 'integer',
  $createdAtBlockHeight: 'integer',
  $updatedAtBlockHeight: 'integer',
  $transferredAtBlockHeight: 'integer',
  $createdAtCoreBlockHeight: 'integer',
  $updatedAtCoreBlockHeight: 'integer',
  $transferredAtCoreBlockHeight: 'integer',
  $revision: 'integer',
};

function propertySchema(docSchema: Schema, field: string): Record<string, unknown> | undefined {
  let cur: unknown = docSchema;
  for (const part of field.split('.')) {
    const props = (cur as { properties?: Record<string, unknown> } | undefined)?.properties;
    cur = props?.[part];
    if (!cur || typeof cur !== 'object') return undefined;
  }
  return cur as Record<string, unknown>;
}

export function fieldKind(docSchema: Schema, field: string): FieldKind {
  if (field in SYSTEM_FIELDS) return SYSTEM_FIELDS[field]!;
  const prop = propertySchema(docSchema, field);
  if (!prop) return 'other';
  if (prop.byteArray === true && prop.contentMediaType === 'application/x.dash.dpp.identifier') return 'identifier';
  switch (prop.type) {
    case 'string': return 'string';
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    default: return 'other';
  }
}

export function operatorsFor(kind: FieldKind): FilterOperator[] {
  switch (kind) {
    case 'boolean': return ['=='];
    case 'identifier': return ['==', 'in'];
    case 'integer':
    case 'number': return ['==', '<', '<=', '>', '>=', 'in'];
    case 'string': return [...FILTER_OPERATORS];
    default: return ['==', 'in'];
  }
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

function parseScalar(raw: string, kind: FieldKind, field: string): Parsed {
  const text = raw.trim();
  if (!text) return { ok: false, error: `\`${field}\` needs a value.` };
  if (kind === 'integer') {
    if (!/^-?\d+$/.test(text)) return { ok: false, error: `\`${field}\` is an integer field; "${text}" is not an integer.` };
    const n = Number(text);
    if (!Number.isSafeInteger(n)) return { ok: false, error: `\`${field}\` value ${text} is outside the safe integer range.` };
    return { ok: true, value: n };
  }
  if (kind === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: `\`${field}\` is a number field; "${text}" is not a number.` };
    return { ok: true, value: n };
  }
  if (kind === 'boolean') {
    if (text !== 'true' && text !== 'false') return { ok: false, error: `\`${field}\` is a boolean field; use true or false.` };
    return { ok: true, value: text === 'true' };
  }
  return { ok: true, value: text };
}

export function parseFilterValue(filter: DocumentFilter, docSchema: Schema): Parsed {
  const [field, op, raw] = filter;
  const kind = fieldKind(docSchema, field);
  if (!operatorsFor(kind).includes(op)) return { ok: false, error: `\`${op}\` is not supported on ${kind} field \`${field}\`.` };
  if (op === 'in') {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return { ok: false, error: `\`${field}\` IN needs at least one comma-separated value.` };
    const values: unknown[] = [];
    for (const item of items) {
      const parsed = parseScalar(item, kind, field);
      if (!parsed.ok) return parsed;
      values.push(parsed.value);
    }
    return { ok: true, value: values };
  }
  return parseScalar(raw, kind, field);
}

export interface BuiltQuery {
  where: unknown[];
  orderBy: OrderBy[];
  /** True when orderBy was derived from a range/IN filter, not chosen. */
  orderByDerived: boolean;
  errors: string[];
  warnings: string[];
}

/** Fields declared by any index, in index order, de-duplicated. */
export function indexedFields(indices: SchemaIndex[]): string[] {
  return Array.from(new Set(indices.flatMap((idx) => idx.properties.map((p) => p.field))));
}

/**
 * Build the SDK query. Platform requires every range or IN field in ORDER BY;
 * when the user has not chosen an order, the range/IN field supplies it.
 * Values that do not parse are errors (the query is not sent). Index fit is
 * checked with the query workspace's rules (`checkQueryAgainstIndices`) and
 * reported as warnings: Platform has the last word.
 */
export function buildDocumentsQuery(
  filters: DocumentFilter[],
  orderBy: OrderBy | null,
  docSchema: Schema,
  indices: SchemaIndex[],
  protocolVersion?: number,
): BuiltQuery {
  const errors: string[] = [];
  const where: unknown[] = [];
  for (const filter of filters) {
    const parsed = parseFilterValue(filter, docSchema);
    if (!parsed.ok) errors.push(parsed.error);
    else where.push([filter[0], filter[1], parsed.value]);
  }

  const ordered = filters.find(([, op]) => RANGE_OPERATORS.has(op) || op === 'in')?.[0];
  const derived = !orderBy && !!ordered;
  const effective: OrderBy[] = orderBy ? [orderBy] : ordered ? [[ordered, 'asc']] : [];

  const { warnings } = checkQueryAgainstIndices(
    {
      where: filters.map(([field, operator]) => ({ field, operator })),
      orderBy: effective.map(([field]) => ({ field })),
    },
    indices,
    { protocolVersion },
  );
  return { where, orderBy: effective, orderByDerived: derived, errors, warnings };
}

// ── URL encoding ───────────────────────────────────────────────────────

export function isDocumentFilterList(value: unknown): value is DocumentFilter[] {
  return Array.isArray(value) && value.every((f) =>
    Array.isArray(f) && f.length === 3
    && typeof f[0] === 'string' && f[0].length > 0
    && (FILTER_OPERATORS as readonly string[]).includes(f[1])
    && typeof f[2] === 'string');
}

export function parseOrderBy(raw: string | null): OrderBy | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf(':');
  const field = sep > 0 ? raw.slice(0, sep) : raw;
  const dir = sep > 0 ? raw.slice(sep + 1) : 'asc';
  if (!field || (dir !== 'asc' && dir !== 'desc')) return null;
  return [field, dir];
}

export function serializeOrderBy(orderBy: OrderBy | null): string | null {
  return orderBy ? `${orderBy[0]}:${orderBy[1]}` : null;
}
