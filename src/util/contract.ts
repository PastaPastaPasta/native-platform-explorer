// Helpers for working with unfamiliar SDK return shapes. The DataContract object
// can be either a class instance with getters or a plain object; we normalise.

export interface ContractShape {
  id?: string;
  ownerId?: string;
  version?: number | bigint | string;
  documentSchemas?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  raw: unknown;
}

function readProp<T>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  const direct = rec[key];
  if (direct !== undefined) return direct as T;
  const getterName = `get${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
  const getter = rec[getterName];
  if (typeof getter === 'function') {
    try {
      return (getter as () => T).call(rec);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function idToString(x: unknown): string | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.toString === 'function' && o.toString !== Object.prototype.toString) {
      try {
        const s = (o.toString as () => unknown)();
        if (typeof s === 'string' && s !== '[object Object]') return s;
      } catch {
        /* noop */
      }
    }
    if (typeof o.base58 === 'string') return o.base58;
  }
  return undefined;
}

export function normaliseContract(input: unknown): ContractShape {
  const id = idToString(readProp<unknown>(input, 'id'));
  const ownerId = idToString(readProp<unknown>(input, 'ownerId'));
  const version = readProp<number | bigint | string>(input, 'version');
  const documentSchemas =
    readProp<Record<string, unknown>>(input, 'documentSchemas') ??
    readProp<Record<string, unknown>>(input, 'documents') ??
    readProp<Record<string, unknown>>(input, 'documentTypes');
  const tokens =
    readProp<Record<string, unknown>>(input, 'tokens') ??
    readProp<Record<string, unknown>>(input, 'tokenConfigurations');
  const groups = readProp<Record<string, unknown>>(input, 'groups');
  return { id, ownerId, version, documentSchemas, tokens, groups, raw: input };
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
