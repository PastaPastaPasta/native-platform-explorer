import type { AggregateKind, DocumentsQueryParams } from '@sdk/queries';
import type { NetworkConfig } from '@sdk/networks';
import type { ParsedQuery } from './sql-parser';

/** Truncate to four fractional digits without converting either integer to Number. */
export function formatAverage(sum: bigint, count: bigint): string {
  if (count === 0n) return '—';
  const negative = sum < 0n !== count < 0n;
  const numerator = sum < 0n ? -sum : sum;
  const denominator = count < 0n ? -count : count;
  const whole = numerator / denominator;
  const fractional = ((numerator % denominator) * 10_000n) / denominator;
  const fraction = fractional.toString().padStart(4, '0').replace(/0+$/, '');
  // Retain the sign even when the fractional value is below display precision.
  const sign = negative && numerator !== 0n ? '-' : '';
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Normalize before stringifying: JSON.stringify invokes SDK toJSON methods itself,
 *  making a replacer alone unable to recover from a throwing toJSON method. */
function queryJsonValue(value: unknown, ancestors = new Set<object>(), depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return null;
  if (ancestors.has(value)) return '[Circular]';
  if (depth > 32) return '[Maximum depth]';
  if (value instanceof Uint8Array) {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  ancestors.add(value);
  const visit = (item: unknown) => queryJsonValue(item, ancestors, depth + 1);
  try {
    try {
      const toBase58 = (value as { toBase58?: unknown }).toBase58;
      if (typeof toBase58 === 'function') return visit(toBase58.call(value));
      const toObject = (value as { toObject?: unknown }).toObject;
      if (typeof toObject === 'function') {
        const serialized: unknown = toObject.call(value);
        if (serialized !== value) return visit(serialized);
      }
    } catch {
      // Some SDK values expose only a version-dependent toJSON method.
    }
    try {
      const toJSON = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') {
        const serialized: unknown = toJSON.call(value);
        if (serialized !== value) return visit(serialized);
      }
    } catch {
      // A freed WASM object can throw; its remaining readable fields still export.
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value instanceof Set) return Array.from(value, visit);

    const out = Object.create(null) as { [key: string]: JsonValue };
    if (value instanceof Map) {
      for (const [key, item] of value) out[String(key)] = visit(item);
      return out;
    }

    const object = value as Record<string, unknown>;
    const addProperty = (key: string) => {
      if (key === '__wbg_ptr' || Object.hasOwn(out, key)) return;
      try {
        const item = object[key];
        if (item !== undefined && typeof item !== 'function' && typeof item !== 'symbol') {
          out[key] = visit(item);
        }
      } catch {
        out[key] = '[Unavailable]';
      }
    };
    Object.keys(object).forEach(addProperty);
    // SDK state may live behind prototype getters instead of own properties.
    let prototype = Object.getPrototypeOf(object) as object | null;
    while (prototype && prototype !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(prototype)) {
        if (Object.getOwnPropertyDescriptor(prototype, key)?.get) addProperty(key);
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** BigInts export as decimal strings; byte arrays export as hexadecimal strings. */
export function serializeQueryJson(value: unknown, indent = 2): string {
  return JSON.stringify(queryJsonValue(value), null, indent);
}

/** Preserve SDK instances here so table accessors and pagination keep their getters. */
export function extractDocumentRows(data: unknown): Array<Record<string, unknown>> {
  const values = data instanceof Map ? Array.from(data.values()) : Array.isArray(data) ? data : [];
  return values.filter(
    (value): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value),
  );
}

/** Keep the canonical group key, rather than guessing a schema-dependent decoded value. */
export function aggregateExportRows(
  data: unknown,
  kind: AggregateKind,
): Array<Record<string, unknown>> {
  if (!(data instanceof Map)) return [];
  return Array.from(data, ([key, value]) => {
    const groupKey = String(key);
    if (
      kind === 'avg' &&
      value &&
      typeof value === 'object' &&
      typeof value.count === 'bigint' &&
      typeof value.sum === 'bigint'
    ) {
      return {
        groupKey,
        count: value.count.toString(),
        sum: value.sum.toString(),
        average: formatAverage(value.sum, value.count),
      };
    }
    return { groupKey, [kind === 'count' ? 'count' : 'sum']: value };
  });
}

function csvCell(value: JsonValue | undefined): string {
  let text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  // Exact negative decimal strings are numeric literals. All other text that
  // could become a spreadsheet formula gets an apostrophe before CSV escaping.
  if (
    typeof value === 'string' &&
    (/^[\t\r\n]/.test(text) || /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) &&
    !/^-\d+(?:\.\d+)?$/.test(text)
  ) {
    text = `'${text}`;
  }
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Export the current rows with the union of their fields in first-seen order. */
export function serializeQueryCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const normalized = rows.map((row) => queryJsonValue(row));
  const records = normalized.filter(
    (row): row is { [key: string]: JsonValue } =>
      row !== null && typeof row === 'object' && !Array.isArray(row),
  );
  const fields = Array.from(new Set(records.flatMap((row) => Object.keys(row))));
  if (fields.length === 0) return '';
  return [
    fields.map(csvCell).join(','),
    ...records.map((row) => fields.map((field) => csvCell(row[field])).join(',')),
  ].join('\r\n');
}

/** JavaScript literals keep bigint query parameters as bigint rather than JSON strings. */
function sdkLiteral(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error('SDK query parameters are too deeply nested.');
  if (typeof value === 'bigint') return `${value}n`;
  if (value === undefined) return 'undefined';
  if (value instanceof Uint8Array) return `new Uint8Array(${JSON.stringify(Array.from(value))})`;
  if (Array.isArray(value))
    return `[${value.map((item) => sdkLiteral(item, depth + 1)).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{\n${fields.map(([key, item]) => `  ${JSON.stringify(key)}: ${sdkLiteral(item, depth + 1)}`).join(',\n')}\n}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Generate an example for the pinned SDK, including its explicit connection step. */
export function buildSdkExample(
  parsed: ParsedQuery,
  params: DocumentsQueryParams,
  network: string | NetworkConfig,
  trusted: boolean,
): string {
  const name = typeof network === 'string' ? network : network.name;
  const type =
    typeof network === 'string'
      ? name === 'mainnet' || name === 'testnet'
        ? name
        : 'devnet'
      : network.type;
  let construction: string;
  let instructions = '';
  if (type === 'mainnet' || type === 'testnet') {
    construction = `EvoSDK.${type}${trusted ? 'Trusted' : ''}()`;
  } else {
    const config = typeof network === 'string' ? undefined : network;
    const devnetName = config?.devnetName ?? name.replace(/^devnet-/, '');
    if (trusted) {
      const options = config?.quorumUrl ? `, ${sdkLiteral({ quorumUrl: config.quorumUrl })}` : '';
      construction = `EvoSDK.devnetTrusted(${JSON.stringify(devnetName)}${options})`;
    } else {
      const addresses = config?.dapiAddresses;
      if (!addresses?.length) {
        instructions = '// Replace DAPI_HOST with your devnet masternode endpoint.\n';
      }
      construction = `EvoSDK.devnet(${JSON.stringify(devnetName)}, ${sdkLiteral({
        addresses: addresses?.length ? addresses : ['https://DAPI_HOST:1443'],
      })})`;
    }
  }

  let query: string;
  if (parsed.select === 'documents') {
    query = trusted
      ? 'const response = await sdk.documents.queryWithProof(params);\nconst result = response.data;'
      : 'const result = await sdk.documents.query(params);';
  } else {
    if (parsed.select !== 'count' && !parsed.aggregateField) {
      throw new Error('SUM and AVG SDK examples require an aggregate field.');
    }
    const method =
      parsed.select === 'count'
        ? 'getDocumentsCount'
        : parsed.select === 'sum'
          ? 'getDocumentsSum'
          : 'getDocumentsAverage';
    const field = parsed.select === 'count' ? '' : `, ${JSON.stringify(parsed.aggregateField)}`;
    query =
      '// This workspace uses the WASM aggregate path without proof capture.\n' +
      '// The pinned SDK also provides countWithProof, sumWithProof, and averageWithProof facades.\n' +
      'const wasmSdk = await sdk.getWasmSdkConnected();\n' +
      `const result = await wasmSdk.${method}(params${field});`;
  }
  return (
    `// npm install @dashevo/evo-sdk@4.0.0-rc.2\n` +
    `import { EvoSDK } from '@dashevo/evo-sdk';\n\n` +
    `${instructions}const sdk = ${construction};\nawait sdk.connect();\n\n` +
    `const params = ${sdkLiteral(params)};\n\n${query}\n\n` +
    '// Normalize SDK Documents before JSON.stringify invokes their versioned toJSON.\n' +
    'function plain(value) {\n' +
    "  if (typeof value === 'bigint') return value.toString();\n" +
    "  if (!value || typeof value !== 'object') return value;\n" +
    "  if (typeof value.toBase58 === 'function') return value.toBase58();\n" +
    "  if (typeof value.toObject === 'function') return plain(value.toObject());\n" +
    '  if (value instanceof Uint8Array) return Array.from(value);\n' +
    '  if (Array.isArray(value)) return value.map(plain);\n' +
    '  const entries = value instanceof Map ? [...value] : Object.entries(value);\n' +
    '  return Object.fromEntries(entries.map(([key, item]) => [key, plain(item)]));\n' +
    '}\nconsole.log(JSON.stringify(plain(result), null, 2));'
  );
}

export interface SavedQuery {
  name: string;
  sql: string;
}

export const MAX_SAVED_QUERIES = 20;
export const MAX_SAVED_QUERY_NAME_LENGTH = 80;
export const MAX_SAVED_QUERY_SQL_LENGTH = 20_000;
const MAX_SAVED_QUERIES_BYTES =
  MAX_SAVED_QUERIES * ((MAX_SAVED_QUERY_SQL_LENGTH + MAX_SAVED_QUERY_NAME_LENGTH) * 6 + 100);

export function savedQueriesKey(network: string, contractId: string): string {
  return `npe:savedQueries:v1:${encodeURIComponent(network)}:${encodeURIComponent(contractId)}`;
}

function validatedSavedQueries(value: unknown): SavedQuery[] {
  if (!Array.isArray(value)) return [];
  const result: SavedQuery[] = [];
  const names = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { name, sql } = entry as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > MAX_SAVED_QUERY_NAME_LENGTH ||
      typeof sql !== 'string' ||
      !sql.trim() ||
      sql.length > MAX_SAVED_QUERY_SQL_LENGTH
    )
      continue;
    const trimmedName = name.trim();
    if (names.has(trimmedName)) continue;
    names.add(trimmedName);
    result.push({ name: trimmedName, sql });
    if (result.length === MAX_SAVED_QUERIES) break;
  }
  return result;
}

/** Malformed or unexpectedly large local storage values are ignored, never executed. */
export function parseSavedQueries(raw: string | null): SavedQuery[] {
  if (!raw || raw.length > MAX_SAVED_QUERIES_BYTES) return [];
  try {
    return validatedSavedQueries(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function queryStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSavedQueries(
  network: string,
  contractId: string,
  storage: Storage | null = queryStorage(),
): SavedQuery[] {
  try {
    return parseSavedQueries(storage?.getItem(savedQueriesKey(network, contractId)) ?? null);
  } catch {
    return [];
  }
}

/** Only call after an explicit user save/delete action; running a query does not save it. */
export function saveSavedQueries(
  network: string,
  contractId: string,
  queries: SavedQuery[],
  storage: Storage | null = queryStorage(),
): boolean {
  if (!storage) return false;
  try {
    const key = savedQueriesKey(network, contractId);
    const validated = validatedSavedQueries(queries);
    if (validated.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}

/** Re-read committed changes before an explicit action; localStorage writes are not transactional. */
export function updateSavedQueries(
  network: string,
  contractId: string,
  update: (queries: SavedQuery[]) => SavedQuery[],
  storage: Storage | null = queryStorage(),
): { status: 'saved' | 'limit'; queries: SavedQuery[] } | { status: 'unavailable' } {
  if (!storage) return { status: 'unavailable' };
  try {
    const current = parseSavedQueries(storage.getItem(savedQueriesKey(network, contractId)));
    const next = update(current);
    // Reject rather than silently truncating another tab's persisted entries.
    if (next.length > MAX_SAVED_QUERIES) return { status: 'limit', queries: current };
    if (!saveSavedQueries(network, contractId, next, storage)) return { status: 'unavailable' };
    return { status: 'saved', queries: validatedSavedQueries(next) };
  } catch {
    // A denied read must not become an empty list that overwrites existing storage.
    return { status: 'unavailable' };
  }
}

/** Quote one SQL identifier, including reserved words and punctuation. */
export function quoteSqlIdentifier(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`';
}
