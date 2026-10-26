import { describe, expect, it } from 'vitest';
import {
  aggregateGroupBound,
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

const V14 = { protocolVersion: 14 };

describe('checkQueryAgainstIndices', () => {
  // Each case was run against testnet DPNS (protocol version 14) with documents.queryWithProof.
  it.each([
    ['two-sided range on one field', q([{ field: P, operator: '==' }, { field: L, operator: '>=' }, { field: L, operator: '<=' }], [L])],
    ['range on the first property', q([{ field: P, operator: '>' }], [P])],
    ['IN on the first property with ORDER BY', q([{ field: P, operator: 'in' }], [P])],
    ['ORDER BY both properties', q([], [P, L])],
    ['prefix search', q([{ field: P, operator: '==' }, { field: L, operator: 'startsWith' }], [L])],
  ])('accepts %s', (_, shape) => {
    expect(checkQueryAgainstIndices(shape, DPNS, V14)).toEqual({ matchedIndex: 'parentNameAndLabel', warnings: [] });
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

  it('accepts ORDER BY on a later property without filtering earlier ones up to protocol 13', () => {
    // Mainnet (protocol 13) returns documents for this; testnet (protocol 14) rejects it.
    expect(checkQueryAgainstIndices(q([], [L]), DPNS)).toEqual({ matchedIndex: 'parentNameAndLabel', warnings: [] });
    expect(checkQueryAgainstIndices(q([], [L]), DPNS, V14).warnings).toEqual([
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): \`${P}\` comes before \`${L}\` and must be filtered first.`,
    ]);
  });

  it('accepts the withdrawal pooling query Drive issues itself', () => {
    // fetch_oldest_withdrawal_documents_by_status_v0 in rs-drive 4.0.0-rc.2.
    const pooling: SchemaIndex[] = [
      { name: 'pooling', properties: ['status', 'pooling', 'coreFeePerByte', '$updatedAt'].map((field) => ({ field, order: 'asc' as const })) },
    ];
    const shape = q([{ field: 'status', operator: '==' }], ['$updatedAt']);
    expect(checkQueryAgainstIndices(shape, pooling)).toEqual({ matchedIndex: 'pooling', warnings: [] });
    // Protocol 14 needs the whole tail in ORDER BY, as Drive 5.0 now sends.
    expect(checkQueryAgainstIndices(shape, pooling, V14).warnings[0]).toMatch(/`pooling` comes before `\$updatedAt` and must be filtered first/);
    expect(checkQueryAgainstIndices(q([{ field: 'status', operator: '==' }], ['pooling', 'coreFeePerByte', '$updatedAt']), pooling, V14)).toEqual({
      matchedIndex: 'pooling',
      warnings: [],
    });
  });

  it('explains why no index fits', () => {
    expect(checkQueryAgainstIndices(q([{ field: L, operator: '==' }]), DPNS, V14).warnings).toEqual([
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): equality filters must cover its first property (\`${P}\`).`,
    ]);
    expect(checkQueryAgainstIndices(q([{ field: P, operator: '==' }], ['$createdAt']), DPNS).warnings[0]).toBe(
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): it does not include \`$createdAt\`.`,
    );
    expect(checkQueryAgainstIndices(q([], [L, P]), DPNS).warnings[0]).toMatch(/ORDER BY must list consecutive properties in index order/);
  });

  it('checks range position, IN placement and unused properties', () => {
    const abcd: SchemaIndex[] = [{ name: 'abcd', properties: ['a', 'b', 'c', 'd'].map((field) => ({ field, order: 'asc' as const })) }];
    const gapped = q([{ field: 'a', operator: '==' }, { field: 'c', operator: '>' }], ['c']);
    expect(checkQueryAgainstIndices(gapped, abcd, V14).warnings[0]).toMatch(
      /abcd \(a, b, c, d\): `c` must be the property right after the equality-filtered ones \(`b`\)/,
    );
    expect(checkQueryAgainstIndices(gapped, abcd)).toEqual({ matchedIndex: 'abcd', warnings: [] });
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: 'in' }], ['a']), abcd).warnings[0]).toMatch(
      /IN is only allowed on its last two properties \(`c`, `d`\)/,
    );
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }]), abcd).warnings).toEqual([
      'The closest index, abcd (a, b, c, d), leaves 3 properties unused; at most 2 may be.',
    ]);
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }, { field: 'b', operator: '==' }]), abcd)).toEqual({ matchedIndex: 'abcd', warnings: [] });
  });

  it('picks the index with the fewest unused properties', () => {
    const indices: SchemaIndex[] = [
      { name: 'abc', properties: ['a', 'b', 'c'].map((field) => ({ field, order: 'asc' as const })) },
      { name: 'ab', properties: ['a', 'b'].map((field) => ({ field, order: 'asc' as const })) },
    ];
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }]), indices).matchedIndex).toBe('ab');
    // Equal fits go to the first index by name, as in Drive's BTreeMap.
    const twins: SchemaIndex[] = ['zzz', 'aaa'].map((name) => ({ name, properties: [{ field: 'a', order: 'asc' as const }] }));
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: '==' }]), twins).matchedIndex).toBe('aaa');
  });

  it('requires ORDER BY to reach every other field the query uses', () => {
    const shape = q([{ field: P, operator: '==' }, { field: L, operator: '==' }], [P]);
    expect(checkQueryAgainstIndices(shape, DPNS).warnings[0]).toBe(
      `No index supports this filter and ORDER BY combination. parentNameAndLabel (${P}, ${L}): ORDER BY must continue through \`${L}\`, which the query also uses.`,
    );
    expect(checkQueryAgainstIndices(q([{ field: P, operator: '==' }, { field: L, operator: '==' }], [L]), DPNS).warnings).toEqual([]);
  });

  it('does not require ORDER BY for $id lookups', () => {
    expect(checkQueryAgainstIndices(q([{ field: '$id', operator: 'in' }]), DPNS)).toEqual({ warnings: [] });
  });

  it('flags conflicting or multiple range fields, and several IN filters before protocol 14', () => {
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
    const twoIn = q([{ field: P, operator: 'in' }, { field: L, operator: 'in' }], [P, L]);
    expect(checkQueryAgainstIndices(twoIn, DPNS).warnings[0]).toBe(`Only one IN filter is allowed per query; this query has IN on \`${P}\`, \`${L}\`.`);
    // Protocol 14 places several IN fields with a search this check does not model.
    const abc: SchemaIndex[] = [{ name: 'abc', properties: ['a', 'b', 'c'].map((field) => ({ field, order: 'asc' as const })) }];
    expect(checkQueryAgainstIndices(q([{ field: 'a', operator: 'in' }, { field: 'b', operator: 'in' }], ['a', 'b']), abc, V14)).toEqual({ warnings: [] });
    expect(checkQueryAgainstIndices(q([{ field: P, operator: 'in' }, { field: P, operator: '>' }], [P]), DPNS).warnings[0]).toBe(
      `\`${P}\` is filtered with IN and with a range; use one filter per field.`,
    );
    expect(checkQueryAgainstIndices(q([{ field: P, operator: '==' }, { field: P, operator: '==' }]), DPNS).warnings[0]).toBe(
      `\`${P}\` has more than one = filter; use one filter per field.`,
    );
  });
});

const g = (where: QueryShape['where'], groupBy?: string[], limit?: number): QueryShape => ({ where, orderBy: [], groupBy, limit });

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

  it('needs the filtered fields to be exactly a countable index, not just its prefix', () => {
    const ab = getIndicesForType({ indices: [{ name: 'ab', properties: [{ a: 'asc' }, { b: 'asc' }], countable: true }] });
    const rangeAb = getIndicesForType({ indices: [{ name: 'ab', properties: [{ a: 'asc' }, { b: 'asc' }], countable: true, rangeCountable: true }] });
    const onA = q([{ field: 'a', operator: '==' }]);
    expect(checkAggregateAgainstIndices(onA, 'count', undefined, ab, { countable: false }).warnings[0]).toMatch(/^A filtered COUNT needs a countable index whose properties are exactly the filtered fields \(`a`\)/);
    // `find_countable_index_for_where_clauses` needs the exact property count, even on a range index.
    expect(checkAggregateAgainstIndices(onA, 'count', undefined, rangeAb, { countable: false }).warnings[0]).toMatch(/^A filtered COUNT needs a countable index/);
    expect(checkAggregateAgainstIndices(q([{ field: 'a', operator: '==' }, { field: 'b', operator: 'in' }]), 'count', undefined, ab, { countable: false })).toEqual({ matchedIndex: 'ab', warnings: [] });
  });

  it('warns before running an aggregate without a suitable index', () => {
    const dpnsCount = checkAggregateAgainstIndices(q([{ field: P, operator: '==' }]), 'count', undefined, DPNS, { countable: false });
    expect(dpnsCount.warnings).toEqual([
      `A filtered COUNT needs a countable index whose properties are exactly the filtered fields (\`${P}\`). This document type has no countable index.`,
    ]);
    expect(checkAggregateAgainstIndices(q([]), 'count', undefined, DPNS, { countable: false }).warnings).toEqual([
      'An unfiltered COUNT needs `documentsCountable: true` on the document type, which it does not declare.',
    ]);
    expect(checkAggregateAgainstIndices(q([{ field: 'student', operator: '==' }]), 'sum', 'score', indices, docType).warnings[0]).toBe(
      'A filtered SUM needs a summable: "score" index whose properties are exactly the filtered fields (`student`). Indices with those flags: byClass (class); byClassSemester (class, semester).',
    );
    expect(checkAggregateAgainstIndices(q([{ field: 'student', operator: '>' }]), 'count', undefined, indices, docType).warnings[0]).toBe(
      'A COUNT with a range on `student` needs a range countable index whose last property is `student` and whose other properties are the filtered fields (`student`). Indices with those flags: byClassSemester (class, semester).',
    );
  });

  it('accepts the Drive 4.0 GROUP BY shapes', () => {
    const classes = ['CS101', 'CS202', 'MATH150'];
    expect(checkAggregateAgainstIndices(g([{ field: 'class', operator: 'in', value: classes }], ['class']), 'avg', 'score', indices, docType)).toEqual({ matchedIndex: 'byClass', warnings: [] });
    const rolling = g([{ field: 'class', operator: '==' }, { field: 'semester', operator: 'between' }], ['semester']);
    expect(checkAggregateAgainstIndices(rolling, 'avg', 'score', indices, docType)).toEqual({ matchedIndex: 'byClassSemester', warnings: [] });
    const compound = g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: '>' }], ['class', 'semester'], 5);
    expect(checkAggregateAgainstIndices(compound, 'count', undefined, indices, docType)).toEqual({ matchedIndex: 'byClassSemester', warnings: [] });
    // In + range grouped by the IN field: the carrier per-IN proof.
    const perIn = g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: '>' }], ['class']);
    expect(checkAggregateAgainstIndices(perIn, 'count', undefined, indices, docType)).toEqual({ matchedIndex: 'byClassSemester', warnings: [] });
  });

  it('accepts two ranges on different fields grouped by the outer one (carrier aggregate)', () => {
    const shape = g([{ field: 'class', operator: '>' }, { field: 'semester', operator: '>' }], ['class']);
    expect(checkAggregateAgainstIndices(shape, 'count', undefined, indices, docType)).toEqual({ matchedIndex: 'byClassSemester', warnings: [] });
    // The carrier picker ignores GROUP BY and walks the index's first property.
    expect(checkAggregateAgainstIndices(g(shape.where, ['semester']), 'count', undefined, indices, docType)).toEqual({
      matchedIndex: 'byClassSemester',
      warnings: ['Platform groups this by `class`, the first property of byClassSemester (class, semester), not by `semester`.'],
    });
    expect(checkAggregateAgainstIndices(g([...shape.where, { field: 'student', operator: '==' }], ['class']), 'count', undefined, indices, docType).warnings).toEqual([
      'Platform ignores the filter on `student` for this shape, because byClassSemester (class, semester) does not include it.',
    ]);
    expect(checkAggregateAgainstIndices(g(shape.where, ['class'], 50), 'count', undefined, indices, docType).warnings).toEqual([
      'A COUNT grouped over two ranges returns at most 10 groups; use LIMIT 10 or less.',
    ]);
    const twoRanges = 'Only one field can use range filters in an aggregate; this query uses `class`, `semester`. Two ranges on different fields work only for COUNT with GROUP BY one of them and no IN filter.';
    expect(checkAggregateAgainstIndices(g(shape.where), 'count', undefined, indices, docType).warnings[0]).toBe(twoRanges);
    // SUM and AVG have no carrier walk.
    expect(checkAggregateAgainstIndices(shape, 'sum', 'score', indices, docType).warnings[0]).toBe(twoRanges);
    expect(checkAggregateAgainstIndices(shape, 'avg', 'score', indices, docType).warnings[0]).toBe(twoRanges);
  });

  it('rejects the shapes Drive 4.0 rejects under proof', () => {
    const rangeAndIn = g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: '>' }]);
    expect(checkAggregateAgainstIndices(rangeAndIn, 'count', undefined, indices, docType).warnings[0]).toBe(
      'An IN filter with a range filter needs GROUP BY class (or GROUP BY class, semester) when proofs are requested.',
    );
    const twoIn = g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: 'in' }]);
    expect(checkAggregateAgainstIndices(twoIn, 'count', undefined, indices, docType).warnings[0]).toBe(
      'Only one IN filter is allowed per query; this query has IN on `class`, `semester`.',
    );
    expect(checkAggregateAgainstIndices(g([{ field: 'class', operator: '==' }], ['class']), 'count', undefined, indices, docType).warnings[0]).toBe(
      'GROUP BY `class` needs an IN or range filter on `class`; Platform groups only by filtered values.',
    );
    expect(checkAggregateAgainstIndices(g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: '>' }], ['semester', 'class']), 'count', undefined, indices, docType).warnings[0]).toBe(
      'A two-field GROUP BY must name an IN-filtered field, then a range-filtered field.',
    );
  });

  it('rejects LIMIT where Drive 4.0 does', () => {
    expect(checkAggregateAgainstIndices(g([], undefined, 5), 'count', undefined, indices, docType).warnings).toEqual([
      'LIMIT is not allowed on COUNT without GROUP BY; the result is a single row.',
    ]);
    const perIn = g([{ field: 'class', operator: 'in' }, { field: 'semester', operator: '>' }], ['class'], 5);
    expect(checkAggregateAgainstIndices(perIn, 'count', undefined, indices, docType).warnings).toEqual([
      'LIMIT is not allowed with GROUP BY on an IN field; the IN list already bounds the result, so shorten it instead.',
    ]);
  });

  it('rejects SUM and AVG of a field other than the document type sum', () => {
    expect(checkAggregateAgainstIndices(g([]), 'sum', 'credits', indices, docType).warnings[0]).toBe(
      'This document type sums `score`, so SUM(credits) is rejected.',
    );
  });
});

describe('aggregateGroupBound', () => {
  it('bounds range groups by LIMIT or the default, and not IN groups', () => {
    const range = [{ field: 'semester', operator: '>' as const }];
    expect(aggregateGroupBound(g(range, ['semester']))).toEqual({ limit: 100, entriesPerGroup: 1 });
    expect(aggregateGroupBound(g(range, ['semester'], 5))).toEqual({ limit: 5, entriesPerGroup: 1 });
    expect(aggregateGroupBound(g([{ field: 'class', operator: 'in', value: ['a', 'b'] }], ['class'], 5))).toBeUndefined();
    expect(aggregateGroupBound(g([]))).toBeUndefined();
  });

  it('counts compound pairs per merged row, and caps the carrier walk at 10', () => {
    const compound = g([{ field: 'class', operator: 'in', value: ['a', 'b', 'b', 'c'] }, { field: 'semester', operator: '>' }], ['class', 'semester'], 20);
    expect(aggregateGroupBound(compound)).toEqual({ limit: 20, entriesPerGroup: 3 });
    expect(aggregateGroupBound(g([{ field: 'class', operator: '>' }, { field: 'semester', operator: '>' }], ['class']))).toEqual({ limit: 10, entriesPerGroup: 1 });
    // A range GROUP BY with an IN on another field also returns (in, range) pairs.
    const rangeWithIn = g([{ field: 'class', operator: 'in', value: ['a', 'b'] }, { field: 'semester', operator: '>' }], ['semester']);
    expect(aggregateGroupBound(rangeWithIn)).toEqual({ limit: 100, entriesPerGroup: 2 });
  });
});
