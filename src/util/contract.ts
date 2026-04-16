// Helpers for working with unfamiliar SDK return shapes. The DataContract object
// can be either a class instance with getters or a plain object; we normalise.

import { idToString, readProp } from './sdk-shape';

export interface ContractShape {
  id?: string;
  ownerId?: string;
  version?: number | bigint | string;
  documentSchemas?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  raw: unknown;
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
