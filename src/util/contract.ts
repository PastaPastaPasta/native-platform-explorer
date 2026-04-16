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
function toPlain(value: unknown): unknown {
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

export function groupPositions(c: ContractShape): string[] {
  if (!c.groups) return [];
  return Object.keys(c.groups);
}
