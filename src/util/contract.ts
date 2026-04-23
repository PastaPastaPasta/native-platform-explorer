// Helpers for working with unfamiliar SDK return shapes. The DataContract object
// can be either a class instance with getters or a plain object; we normalise.

import { idToString, readProp } from './sdk-shape';

export interface ContractShape {
  id?: string;
  ownerId?: string;
  version?: number | bigint | string;
  /** `rawContract` is the DataContract serialised to plain JSON via its
   *  `.toJSON()` (if present) or a shallow getter walk. Use this for display. */
  plain?: Record<string, unknown>;
  documentSchemas?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  raw: unknown;
}

/** Coerce a WASM class / Map / nested value into a plain JS object as best we
 *  can so downstream renderers (CodeBlock, Object.keys) actually see data. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    try {
      return (value as { toJSON: () => unknown }).toJSON();
    } catch {
      /* fall through */
    }
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value) out[String(k)] = toPlain(v);
    return out;
  }
  return value;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  const plain = toPlain(value);
  if (plain && typeof plain === 'object' && !Array.isArray(plain)) {
    return plain as Record<string, unknown>;
  }
  return undefined;
}

export function normaliseContract(input: unknown): ContractShape {
  const plain = toRecord(input);
  const id = idToString(readProp<unknown>(input, 'id')) ?? idToString(plain?.id);
  const ownerId = idToString(readProp<unknown>(input, 'ownerId')) ?? idToString(plain?.ownerId);
  const version =
    readProp<number | bigint | string>(input, 'version') ??
    (plain?.version as number | bigint | string | undefined);
  const documentSchemas =
    toRecord(readProp<unknown>(input, 'documentSchemas')) ??
    toRecord(readProp<unknown>(input, 'documents')) ??
    toRecord(readProp<unknown>(input, 'documentTypes')) ??
    toRecord(plain?.documentSchemas) ??
    toRecord(plain?.documents) ??
    toRecord(plain?.documentTypes);
  const tokens =
    toRecord(readProp<unknown>(input, 'tokens')) ??
    toRecord(readProp<unknown>(input, 'tokenConfigurations')) ??
    toRecord(plain?.tokens) ??
    toRecord(plain?.tokenConfigurations);
  const groups =
    toRecord(readProp<unknown>(input, 'groups')) ?? toRecord(plain?.groups);
  return { id, ownerId, version, plain, documentSchemas, tokens, groups, raw: input };
}

export function documentTypeNames(c: ContractShape): string[] {
  if (!c.documentSchemas) return [];
  return Object.keys(c.documentSchemas);
}

export function tokenPositions(c: ContractShape): string[] {
  if (!c.tokens) return [];
  return Object.keys(c.tokens);
}

export interface TokenLocalization {
  singularForm?: string;
  pluralForm?: string;
  shouldCapitalize?: boolean;
}

/**
 * Projection of the fields we surface in the explorer from a single
 * `TokenConfiguration` entry inside a data contract. Every field is
 * optional because the contract-side shape may be either a plain JSON
 * document or a WASM class with getters, and we stay permissive.
 */
export interface TokenConfigShape {
  position: number;
  decimals?: number;
  localizations?: Record<string, TokenLocalization>;
  /** Convenience: the "en" singular form, or the first localization we find. */
  primaryName?: string;
  description?: string;
  baseSupply?: bigint | number | string;
  maxSupply?: bigint | number | string;
  isStartedAsPaused?: boolean;
  mainControlGroup?: number;
  /** Untouched raw value for callers who want to drill into full rules. */
  raw: unknown;
}

function coerceLocalizations(value: unknown): Record<string, TokenLocalization> | undefined {
  const plain = toPlain(value);
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) return undefined;
  const out: Record<string, TokenLocalization> = {};
  for (const [lang, entry] of Object.entries(plain as Record<string, unknown>)) {
    const flat = toPlain(entry);
    if (!flat || typeof flat !== 'object') continue;
    const l = flat as Record<string, unknown>;
    out[lang] = {
      singularForm: typeof l.singularForm === 'string' ? l.singularForm : undefined,
      pluralForm: typeof l.pluralForm === 'string' ? l.pluralForm : undefined,
      shouldCapitalize: typeof l.shouldCapitalize === 'boolean' ? l.shouldCapitalize : undefined,
    };
  }
  return out;
}

function pickPrimaryName(locs?: Record<string, TokenLocalization>): string | undefined {
  if (!locs) return undefined;
  const english = locs.en?.singularForm ?? locs.en?.pluralForm;
  if (english) return english;
  for (const l of Object.values(locs)) {
    const v = l.singularForm ?? l.pluralForm;
    if (v) return v;
  }
  return undefined;
}

/** Extract the token-configuration entry at `position` from a contract shape. */
export function tokenConfigAt(c: ContractShape, position: number): TokenConfigShape | null {
  if (!c.tokens) return null;
  const entry = c.tokens[String(position)];
  if (!entry && entry !== 0) return null;
  const conventions = toPlain(readProp<unknown>(entry, 'conventions')) as
    | Record<string, unknown>
    | undefined;
  const decimals = readProp<number>(conventions, 'decimals');
  const localizations = coerceLocalizations(readProp<unknown>(conventions, 'localizations'));
  return {
    position,
    decimals: typeof decimals === 'number' ? decimals : undefined,
    localizations,
    primaryName: pickPrimaryName(localizations),
    description: readProp<string>(entry, 'description'),
    baseSupply: readProp<bigint | number | string>(entry, 'baseSupply'),
    maxSupply: readProp<bigint | number | string>(entry, 'maxSupply'),
    isStartedAsPaused: readProp<boolean>(entry, 'isStartedAsPaused'),
    mainControlGroup: readProp<number>(entry, 'mainControlGroup'),
    raw: entry,
  };
}

export function groupPositions(c: ContractShape): string[] {
  if (!c.groups) return [];
  return Object.keys(c.groups);
}

export interface ContestedIndex {
  docType: string;
  indexName: string;
  properties: string[];
}

/** Scan document schemas for indexes that declare a `contested` section. */
export function contestedIndexes(c: ContractShape): ContestedIndex[] {
  if (!c.documentSchemas) return [];
  const result: ContestedIndex[] = [];
  for (const [docType, schema] of Object.entries(c.documentSchemas)) {
    const s = schema as Record<string, unknown> | undefined;
    const indices = (s?.indices ?? s?.['$indices']) as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(indices)) continue;
    for (const idx of indices) {
      if (!idx.contested) continue;
      const name = typeof idx.name === 'string' && idx.name ? idx.name : undefined;
      if (!name) continue;
      const props = Array.isArray(idx.properties)
        ? (idx.properties as Array<Record<string, unknown>>).flatMap((p) => Object.keys(p))
        : [];
      result.push({ docType, indexName: name, properties: props });
    }
  }
  return result;
}
