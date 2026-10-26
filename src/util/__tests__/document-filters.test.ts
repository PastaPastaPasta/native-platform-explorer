import { describe, expect, it } from 'vitest';
import {
  buildDocumentsQuery,
  fieldKind,
  isDocumentFilterList,
  operatorsFor,
  parseFilterValue,
  parseOrderBy,
  serializeOrderBy,
} from '../document-filters';
import { getIndicesForType } from '../schema';

// Trimmed from the DPNS `domain` type plus integer/boolean fields to cover typing.
const schema = {
  type: 'object',
  indices: [
    { name: 'parentNameAndLabel', properties: [{ normalizedParentDomainName: 'asc' }, { normalizedLabel: 'asc' }], unique: true },
    { name: 'identityId', properties: [{ 'records.identity': 'asc' }] },
    { name: 'byScore', properties: [{ score: 'asc' }, { active: 'asc' }] },
  ],
  properties: {
    normalizedParentDomainName: { type: 'string' },
    normalizedLabel: { type: 'string' },
    records: {
      type: 'object',
      properties: {
        identity: { type: 'array', byteArray: true, contentMediaType: 'application/x.dash.dpp.identifier' },
      },
    },
    score: { type: 'integer' },
    active: { type: 'boolean' },
  },
};
const indices = getIndicesForType(schema);

describe('field typing', () => {
  it('reads kinds from the schema, including nested and system fields', () => {
    expect(fieldKind(schema, 'normalizedLabel')).toBe('string');
    expect(fieldKind(schema, 'records.identity')).toBe('identifier');
    expect(fieldKind(schema, 'score')).toBe('integer');
    expect(fieldKind(schema, 'active')).toBe('boolean');
    expect(fieldKind(schema, '$ownerId')).toBe('identifier');
    expect(fieldKind(schema, '$createdAt')).toBe('integer');
    expect(fieldKind(schema, 'missing')).toBe('other');
  });

  it('offers operators that fit the kind', () => {
    expect(operatorsFor('boolean')).toEqual(['==']);
    expect(operatorsFor('integer')).not.toContain('startsWith');
    expect(operatorsFor('string')).toContain('startsWith');
  });

  it('parses typed values and IN lists', () => {
    expect(parseFilterValue(['score', '>=', ' 10 '], schema)).toEqual({ ok: true, value: 10 });
    expect(parseFilterValue(['score', 'in', '1, 2,3'], schema)).toEqual({ ok: true, value: [1, 2, 3] });
    expect(parseFilterValue(['active', '==', 'false'], schema)).toEqual({ ok: true, value: false });
    expect(parseFilterValue(['normalizedLabel', 'startsWith', 'al'], schema)).toEqual({ ok: true, value: 'al' });
    expect(parseFilterValue(['score', '>', '1.5'], schema)).toMatchObject({ ok: false });
    expect(parseFilterValue(['active', '==', 'yes'], schema)).toMatchObject({ ok: false });
    expect(parseFilterValue(['score', 'startsWith', '1'], schema)).toMatchObject({ ok: false });
    expect(parseFilterValue(['normalizedLabel', 'in', ' , '], schema)).toMatchObject({ ok: false });
  });
});

describe('buildDocumentsQuery', () => {
  it('translates filters to where clauses and derives ORDER BY for a range', () => {
    const q = buildDocumentsQuery(
      [['normalizedParentDomainName', '==', 'dash'], ['normalizedLabel', 'startsWith', 'al']],
      null,
      schema,
      indices,
    );
    expect(q.errors).toEqual([]);
    expect(q.where).toEqual([['normalizedParentDomainName', '==', 'dash'], ['normalizedLabel', 'startsWith', 'al']]);
    expect(q.orderBy).toEqual([['normalizedLabel', 'asc']]);
    expect(q.orderByDerived).toBe(true);
  });

  it('keeps a chosen ORDER BY and warns when it omits the range field', () => {
    const q = buildDocumentsQuery([['score', '>', '5']], ['active', 'desc'], schema, indices);
    expect(q.orderBy).toEqual([['active', 'desc']]);
    expect(q.warnings.join(' ')).toMatch(/needs ORDER BY score/);
  });

  it('accepts an ORDER BY alone on a leading index property', () => {
    const q = buildDocumentsQuery([], ['score', 'desc'], schema, indices);
    expect(q).toMatchObject({ errors: [], warnings: [], orderBy: [['score', 'desc']] });
  });

  it('blocks values that do not parse and warns about index rules without blocking', () => {
    expect(buildDocumentsQuery([['score', '>', 'x']], null, schema, indices).errors[0]).toMatch(/integer/);
    const twoRanges = buildDocumentsQuery([['score', '>', '1'], ['normalizedLabel', '<', 'b']], null, schema, indices);
    expect(twoRanges.errors).toEqual([]);
    expect(twoRanges.warnings.join(' ')).toMatch(/Only one field can use range filters/);
    expect(buildDocumentsQuery([['normalizedLabel', '==', 'a']], null, schema, indices, 14).warnings.join(' '))
      .toMatch(/No index supports this filter/);
    expect(buildDocumentsQuery([['x', '==', 'a']], null, schema, []).warnings[0]).toMatch(/declares no indices/);
  });
});

describe('URL encoding', () => {
  it('round-trips ORDER BY and validates filter lists', () => {
    expect(parseOrderBy(serializeOrderBy(['records.identity', 'desc']))).toEqual(['records.identity', 'desc']);
    expect(parseOrderBy('score')).toEqual(['score', 'asc']);
    expect(parseOrderBy('score:sideways')).toBeNull();
    expect(serializeOrderBy(null)).toBeNull();
    expect(isDocumentFilterList([['a', '==', 'b']])).toBe(true);
    expect(isDocumentFilterList([['a', 'like', 'b']])).toBe(false);
    expect(isDocumentFilterList([['a', '==', 1]])).toBe(false);
    expect(isDocumentFilterList({})).toBe(false);
  });
});
