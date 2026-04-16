import { describe, expect, it } from 'vitest';
import {
  getDocumentTypeSchema,
  getIndicesForType,
  heuristicColumnsForType,
  validateWhereAgainstIndices,
} from '../schema';

const contract = {
  documentSchemas: {
    domain: {
      type: 'object',
      indices: [
        {
          name: 'parentNameAndLabel',
          properties: [{ parentDomainName: 'asc' }, { label: 'asc' }],
          unique: true,
        },
        { name: 'records.identity', properties: [{ 'records.identity': 'asc' }] },
      ],
      properties: {
        label: { type: 'string' },
        parentDomainName: { type: 'string' },
        subdomainRules: { type: 'object' },
      },
    },
  },
};

describe('getDocumentTypeSchema', () => {
  it('finds the domain type schema', () => {
    expect(getDocumentTypeSchema(contract, 'domain')).toBeDefined();
  });
  it('returns undefined for missing types', () => {
    expect(getDocumentTypeSchema(contract, 'nope')).toBeUndefined();
  });
});

describe('getIndicesForType', () => {
  it('extracts two indices', () => {
    const schema = getDocumentTypeSchema(contract, 'domain');
    const idx = getIndicesForType(schema);
    expect(idx.length).toBe(2);
    expect(idx[0]?.name).toBe('parentNameAndLabel');
    expect(idx[0]?.properties[0]).toEqual({ field: 'parentDomainName', order: 'asc' });
  });
});

describe('heuristicColumnsForType', () => {
  it('always includes $id and $ownerId first', () => {
    const schema = getDocumentTypeSchema(contract, 'domain');
    const cols = heuristicColumnsForType(schema);
    expect(cols[0]?.key).toBe('$id');
    expect(cols[1]?.key).toBe('$ownerId');
  });
  it('adds some scalar columns', () => {
    const schema = getDocumentTypeSchema(contract, 'domain');
    const cols = heuristicColumnsForType(schema);
    const keys = cols.map((c) => c.key);
    expect(keys).toContain('label');
    expect(keys).toContain('parentDomainName');
  });
});

describe('validateWhereAgainstIndices', () => {
  const schema = getDocumentTypeSchema(contract, 'domain');
  const indices = getIndicesForType(schema);
  it('accepts an empty where clause', () => {
    expect(validateWhereAgainstIndices([], indices).valid).toBe(true);
  });
  it('matches when both index properties are provided', () => {
    const r = validateWhereAgainstIndices(['parentDomainName', 'label'], indices);
    expect(r.valid).toBe(true);
    expect(r.matchedIndex).toBe('parentNameAndLabel');
  });
  it('matches the leftmost prefix of an index', () => {
    const r = validateWhereAgainstIndices(['parentDomainName'], indices);
    expect(r.valid).toBe(true);
    expect(r.matchedIndex).toBe('parentNameAndLabel');
  });
  it('rejects filters that skip the leading index field', () => {
    // label is the 2nd index property — filtering on it alone is invalid
    // because we skipped parentDomainName.
    const r = validateWhereAgainstIndices(['label'], indices);
    expect(r.valid).toBe(false);
  });
  it('rejects unindexed fields', () => {
    const r = validateWhereAgainstIndices(['subdomainRules'], indices);
    expect(r.valid).toBe(false);
    expect(r.suggestions.length).toBe(2);
  });
});
