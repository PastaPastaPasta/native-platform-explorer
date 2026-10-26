import { describe, expect, it } from 'vitest';
import {
  checkAggregateAgainstIndices,
  checkQueryAgainstIndices,
  getDocumentTypeAggregates,
  getDocumentTypeSchema,
  getIndicesForType,
  heuristicColumnsForType,
  validateWhereAgainstIndices,
  type QueryShape,
  type SchemaIndex,
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

// DPNS `domain` indices as declared on testnet.
const DPNS: SchemaIndex[] = [
  { name: 'parentNameAndLabel', properties: [{ field: 'normalizedParentDomainName', order: 'asc' }, { field: 'normalizedLabel', order: 'asc' }], unique: true },
  { name: 'identityId', properties: [{ field: 'records.identity', order: 'asc' }] },
];
const P = 'normalizedParentDomainName';
const L = 'normalizedLabel';
const q = (where: QueryShape['where'], orderBy: string[] = []): QueryShape => ({ where, orderBy: orderBy.map((field) => ({ field })) });

describe('checkQueryAgainstIndices', () => {
  // Each case was run against testnet DPNS (protocol version 14) with documents.queryWithProof.
  it.each([
    ['two-sided range on one field', q([{ field: P, operator: '==' }, { field: L, operator: '>=' }, { field: L, operator: '<=' }], [L])],
    ['range on the first property', q([{ field: P, operator: '>' }], [P])],
    ['IN on the first property with ORDER BY', q([{ field: P, operator: 'in' }], [P])],
    ['ORDER BY both properties', q([], [P, L])],
    ['prefix search', q([{ field: P, operator: '==' }, { field: L, operator: 'startsWith' }], [L])],
  ])('accepts %s', (_, shape) => {
    expect(checkQueryAgainstIndices(shape, DPNS)).toEqual({ matchedIndex: 'parentNameAndLabel', warnings: [] });
  });

  it('uses the primary key for unfiltered and $id queries', () => {
    expect(checkQueryAgainstIndices(q([]), DPNS)).toEqual({ warnings: [] });
    expect(checkQueryAgainstIndices(q([{ field: '$id', operator: 'in' }], ['$id']), DPNS)).toEqual({ warnings: [] });
  });

  it('requires ORDER BY on range and IN fields', () => {
    expect(checkQueryAgainstIndices(q([{ field: P, operator: '==' }, { field: L, operator: '>' }]), DPNS).warnings).toEqual([
      `The range filter on \`${L}\` needs ORDER BY ${L}; Platform requires ordering on every range and IN field.`,
    ]);
    expect(checkQueryAgainstIndices(q([{ field: P, operator: 'in' }]), DPNS).warnings).toEqual([
      `The IN filter on \`${P}\` needs ORDER BY ${P}; Platform requires ordering on every range and IN field.`,
    ]);
  });

  it('explains why no index fits', () => {
    expect(checkQueryAgainstIndices(q([], [L]), DPNS).warnings).toEqual([
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): \`${P}\` comes before \`${L}\` and must be filtered first.`,
    ]);
    expect(checkQueryAgainstIndices(q([{ field: L, operator: '==' }]), DPNS).warnings).toEqual([
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): equality filters must cover its first property (\`${P}\`).`,
    ]);
    expect(checkQueryAgainstIndices(q([{ field: P, operator: '==' }], ['$createdAt']), DPNS).warnings[0]).toBe(
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): it does not include \`$createdAt\`.`,
    );
    expect(checkQueryAgainstIndices(q([], [L, P]), DPNS).warnings[0]).toMatch(/ORDER BY must list consecutive properties in index order/);
  });

  it('checks range position, IN placement and unused properties', () => {
    const abcd: SchemaIndex[] = [{ name: 'abcd', properties: ['a', 'b', 'c', 'd'].map((field) => ({ field, order: 'asc' as const })) }];
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }, { field: 'c', operator: '>' }], ['c']), abcd).warnings[0]).toMatch(
      /abcd \(a, b, c, d\): `c` must be the property right after the equality-filtered ones \(`b`\)/,
    );
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: 'in' }], ['a']), abcd).warnings[0]).toMatch(
      /IN is only allowed on its last two properties \(`c`, `d`\)/,
    );
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }]), abcd).warnings[0]).toMatch(
      /the query uses 1 of its 4 properties; at most 2 may be left unused/,
    );
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }, { field: 'b', operator: '==' }]), abcd)).toEqual({ matchedIndex: 'abcd', warnings: [] });
  });

  it('flags conflicting or multiple range fields', () => {
    const both = q([{ field: P, operator: '>' }, { field: L, operator: '<' }], [P, L]);
    expect(checkQueryAgainstIndices(both, DPNS).warnings[0]).toBe(
      `Only one field can use range filters (<, <=, >, >=, BETWEEN, STARTS WITH); this query uses \`${P}\`, \`${L}\`.`,
    );
    const conflict = q([{ field: P, operator: '==' }, { field: L, operator: '>' }, { field: L, operator: '>=' }], [L]);
    expect(checkQueryAgainstIndices(conflict, DPNS).warnings).toEqual([
      `\`${L}\` has conflicting range filters. Use at most one lower bound and one upper bound, or a single BETWEEN or STARTS WITH.`,
    ]);
    const between = q([{ field: P, operator: '==' }, { field: L, operator: 'between' }, { field: L, operator: '<' }], [L]);
    expect(checkQueryAgainstIndices(between, DPNS).warnings[0]).toMatch(/conflicting range filters/);
  });
});

describe('aggregate index flags', () => {
  const grade = {
    documentsCountable: true,
    documentsAverageable: 'score',
    indices: [
      { name: 'byClass', properties: [{ class: 'asc' }], countable: 'countable', summable: 'score' },
      { name: 'byClassSemester', properties: [{ class: 'asc' }, { semester: 'asc' }], averageable: 'score', rangeAverageable: true },
      { name: 'byStudent', properties: [{ student: 'asc' }], countable: true },
      { name: 'plain', properties: [{ teacher: 'asc' }], countable: 'notCountable' },
    ],
  };
  const indices = getIndicesForType(grade);
  const docType = getDocumentTypeAggregates(grade);

  it('reads countable, summable and averageable declarations', () => {
    expect(indices.map(({ name, countable, rangeCountable, summable, rangeSummable }) => ({ name, countable, rangeCountable, summable, rangeSummable }))).toEqual([
      { name: 'byClass', countable: true, rangeCountable: undefined, summable: 'score', rangeSummable: undefined },
      { name: 'byClassSemester', countable: true, rangeCountable: true, summable: 'score', rangeSummable: true },
      { name: 'byStudent', countable: true, rangeCountable: undefined, summable: undefined, rangeSummable: undefined },
      { name: 'plain', countable: undefined, rangeCountable: undefined, summable: undefined, rangeSummable: undefined },
    ]);
    expect(docType).toEqual({ countable: true, summable: 'score' });
    expect(getDocumentTypeAggregates({ documentsSummable: 'x' })).toEqual({ countable: false, summable: 'x' });
  });

  it('accepts aggregates that a flagged index or the document type serves', () => {
    const inClass = q([{ field: 'class', operator: 'in' }]);
    expect(checkAggregateAgainstIndices(q([]), 'count', undefined, indices, docType)).toEqual({ warnings: [] });
    expect(checkAggregateAgainstIndices(q([]), 'avg', 'score', indices, docType)).toEqual({ warnings: [] });
    expect(checkAggregateAgainstIndices(inClass, 'count', undefined, indices, docType)).toEqual({ matchedIndex: 'byClass', warnings: [] });
    expect(checkAggregateAgainstIndices(inClass, 'avg', 'score', indices, docType)).toEqual({ matchedIndex: 'byClass', warnings: [] });
    const semesterRange = q([{ field: 'class', operator: '==' }, { field: 'semester', operator: 'between' }]);
    expect(checkAggregateAgainstIndices(semesterRange, 'avg', 'score', indices, docType)).toEqual({ matchedIndex: 'byClassSemester', warnings: [] });
  });

  it('warns before running an aggregate without a suitable index', () => {
    const dpnsCount = checkAggregateAgainstIndices(q([{ field: P, operator: '==' }]), 'count', undefined, DPNS, { countable: false });
    expect(dpnsCount.warnings).toEqual([
      `A filtered COUNT needs a countable index whose leading properties are exactly the filtered fields (\`${P}\`). This document type has no countable index.`,
    ]);
    expect(checkAggregateAgainstIndices(q([]), 'count', undefined, DPNS, { countable: false }).warnings).toEqual([
      'An unfiltered COUNT needs `documentsCountable: true` on the document type, which it does not declare.',
    ]);
    expect(checkAggregateAgainstIndices(q([{ field: 'student', operator: '==' }]), 'sum', 'score', indices, docType).warnings[0]).toBe(
      'A filtered SUM needs a summable: "score" index whose leading properties are exactly the filtered fields (`student`). Indices with those flags: byClass (class); byClassSemester (class, semester).',
    );
    expect(checkAggregateAgainstIndices(q([{ field: 'student', operator: '>' }]), 'count', undefined, indices, docType).warnings[0]).toBe(
      'A COUNT with a range on `student` needs a range countable index whose last property is `student` and whose other properties are the filtered fields (`student`). Indices with those flags: byClassSemester (class, semester).',
    );
  });
});
