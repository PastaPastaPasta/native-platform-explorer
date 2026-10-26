import { describe, expect, it } from 'vitest';
import {
  parseSql,
  parseSqlMulti,
  resolveContractAlias,
  toDocumentsQuery,
  type ParsedQuery,
} from '../sql-parser';
import mainCorpus from './fixtures/main-parser-corpus.json';

// ── parseSql ───────────────────────────────────────────────────────────

describe('parseSql', () => {
  it('parses SELECT * FROM type', () => {
    const r = parseSql('SELECT * FROM domain');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('documents');
    expect(r.query.from).toBe('domain');
    expect(r.query.where).toEqual([]);
    expect(r.query.orderBy).toEqual([]);
    expect(r.query.limit).toBeUndefined();
  });

  it('is case-insensitive for keywords', () => {
    const r = parseSql("select * from domain where label == 'x' order by label asc limit 10");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.from).toBe('domain');
    expect(r.query.where).toHaveLength(1);
    expect(r.query.limit).toBe(10);
  });

  it('parses COUNT(*)', () => {
    const r = parseSql('SELECT COUNT(*) FROM domain');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('count');
    expect(r.query.from).toBe('domain');
  });

  it('parses SUM(field)', () => {
    const r = parseSql('SELECT SUM(score) FROM grade');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('sum');
    expect(r.query.aggregateField).toBe('score');
    expect(r.query.from).toBe('grade');
  });

  it('parses AVG(field) with WHERE', () => {
    const r = parseSql("SELECT AVG(score) FROM grade WHERE class == 'CS101'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('avg');
    expect(r.query.aggregateField).toBe('score');
    expect(r.query.where).toHaveLength(1);
  });

  it('parses GROUP BY single field', () => {
    const r = parseSql('SELECT COUNT(*) FROM grade GROUP BY class');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.groupBy).toEqual(['class']);
  });

  it('allows a trailing semicolon on a single statement', () => {
    const r = parseSql('SELECT * FROM domain;');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.from).toBe('domain');
  });

  it('parses GROUP BY before ORDER BY', () => {
    const r = parseSql(
      "SELECT AVG(score) FROM grade WHERE class == 'CS101' AND semester >= 20241 AND semester <= 20262 GROUP BY semester ORDER BY semester ASC",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('avg');
    expect(r.query.aggregateField).toBe('score');
    expect(r.query.groupBy).toEqual(['semester']);
    expect(r.query.orderBy).toEqual([{ field: 'semester', direction: 'asc' }]);
    expect(r.query.where).toHaveLength(3);
  });

  it('parses FROM with contract alias (dot notation)', () => {
    const r = parseSql('SELECT * FROM dpns.domain');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.contractAlias).toBe('dpns');
    expect(r.query.from).toBe('domain');
  });

  it('parses WHERE with equality (=)', () => {
    const r = parseSql("SELECT * FROM domain WHERE label = 'test'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([{ field: 'label', operator: '==', value: 'test' }]);
  });

  it('parses WHERE with equality (==)', () => {
    const r = parseSql("SELECT * FROM domain WHERE label == 'test'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.operator).toBe('==');
  });

  it('parses WHERE with comparison operators', () => {
    const r = parseSql('SELECT * FROM domain WHERE price >= 100');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([{ field: 'price', operator: '>=', value: 100 }]);
  });

  it('parses WHERE with multiple AND conditions', () => {
    const r = parseSql(
      "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel startsWith 'a'",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toHaveLength(2);
    expect(r.query.where[0]).toEqual({
      field: 'normalizedParentDomainName',
      operator: '==',
      value: 'dash',
    });
    expect(r.query.where[1]).toEqual({
      field: 'normalizedLabel',
      operator: 'startsWith',
      value: 'a',
    });
  });

  it('parses BETWEEN', () => {
    const r = parseSql('SELECT * FROM tx WHERE amount BETWEEN 10 AND 100');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([{ field: 'amount', operator: 'between', value: [10, 100] }]);
  });

  it('parses IN with value list', () => {
    const r = parseSql("SELECT * FROM domain WHERE label IN ('a', 'b', 'c')");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([{ field: 'label', operator: 'in', value: ['a', 'b', 'c'] }]);
  });

  it('parses IN with numeric values', () => {
    const r = parseSql('SELECT * FROM tx WHERE status IN (1, 2, 3)');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.value).toEqual([1, 2, 3]);
  });

  it('parses STARTS WITH (two keywords)', () => {
    const r = parseSql("SELECT * FROM domain WHERE label STARTS WITH 'dash'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([{ field: 'label', operator: 'startsWith', value: 'dash' }]);
  });

  it('parses startsWith as single identifier', () => {
    const r = parseSql("SELECT * FROM domain WHERE label startsWith 'dash'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.operator).toBe('startsWith');
  });

  it('parses ORDER BY single field', () => {
    const r = parseSql('SELECT * FROM domain ORDER BY label ASC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.orderBy).toEqual([{ field: 'label', direction: 'asc' }]);
  });

  it('parses ORDER BY multiple fields', () => {
    const r = parseSql('SELECT * FROM domain ORDER BY a DESC, b ASC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.orderBy).toEqual([
      { field: 'a', direction: 'desc' },
      { field: 'b', direction: 'asc' },
    ]);
  });

  it('defaults ORDER BY direction to ASC', () => {
    const r = parseSql('SELECT * FROM domain ORDER BY label');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.orderBy[0]!.direction).toBe('asc');
  });

  it('parses LIMIT', () => {
    const r = parseSql('SELECT * FROM domain LIMIT 50');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.limit).toBe(50);
  });

  it('rejects multi-statement input from parseSql', () => {
    const r = parseSql('SELECT * FROM a; SELECT * FROM b');
    expect(r.ok).toBe(false);
  });

  it('parses a full complex query', () => {
    const r = parseSql(
      "SELECT * FROM dpns.domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel startsWith 'a' ORDER BY normalizedLabel ASC LIMIT 25",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.select).toBe('documents');
    expect(r.query.contractAlias).toBe('dpns');
    expect(r.query.from).toBe('domain');
    expect(r.query.where).toHaveLength(2);
    expect(r.query.orderBy).toEqual([{ field: 'normalizedLabel', direction: 'asc' }]);
    expect(r.query.limit).toBe(25);
  });

  it('parses dotted field paths', () => {
    const r = parseSql("SELECT * FROM domain WHERE records.identity == 'abc'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.field).toBe('records.identity');
  });

  it('parses $-prefixed system fields', () => {
    const r = parseSql("SELECT * FROM domain WHERE $ownerId == 'abc'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.field).toBe('$ownerId');
  });
});

// ── parseSqlMulti ──────────────────────────────────────────────────────

describe('parseSqlMulti', () => {
  it('parses a single statement', () => {
    const r = parseSqlMulti('SELECT * FROM domain');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queries).toHaveLength(1);
    expect(r.queries[0]!.from).toBe('domain');
  });

  it('parses three semicolon-separated statements with whitespace', () => {
    const r = parseSqlMulti(`
      SELECT AVG(score) FROM grade WHERE class IN ('CS101','CS202') AND semester BETWEEN 20251 AND 20262;
      SELECT AVG(score) FROM grade WHERE class IN ('MATH150','MATH250') AND semester BETWEEN 20251 AND 20262;
      SELECT AVG(score) FROM grade WHERE class == 'ENG101' AND semester BETWEEN 20251 AND 20262;
    `);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queries).toHaveLength(3);
    expect(r.queries.every((q) => q.select === 'avg')).toBe(true);
    expect(r.queries.every((q) => q.aggregateField === 'score')).toBe(true);
  });

  it('tolerates trailing semicolons and multiple separators', () => {
    const r = parseSqlMulti('SELECT * FROM a;; SELECT * FROM b;;;');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queries).toHaveLength(2);
    expect(r.queries.map((q) => q.from)).toEqual(['a', 'b']);
  });

  it('errors on empty input', () => {
    const r = parseSqlMulti('');
    expect(r.ok).toBe(false);
  });

  it('aborts at the first failed statement', () => {
    const r = parseSqlMulti('SELECT * FROM a; not valid sql; SELECT * FROM b');
    expect(r.ok).toBe(false);
  });

  it('handles boolean values', () => {
    const r = parseSql('SELECT * FROM doc WHERE active == true');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.value).toBe(true);
  });

  it('handles negative numbers', () => {
    const r = parseSql('SELECT * FROM doc WHERE offset > -5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.value).toBe(-5);
  });

  it('handles backtick-quoted identifiers', () => {
    const r = parseSql("SELECT * FROM `domain` WHERE `order` == 'test'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.from).toBe('domain');
    expect(r.query.where[0]!.field).toBe('order');
  });

  it('handles string with embedded single quotes', () => {
    const r = parseSql("SELECT * FROM doc WHERE name == 'it''s'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where[0]!.value).toBe("it's");
  });

  // ── Error cases ────────────────────────────────────────────────────

  it('errors on missing FROM', () => {
    const r = parseSql('SELECT *');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('FROM');
  });

  it('errors on missing SELECT', () => {
    const r = parseSql('FROM domain');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('SELECT');
  });

  it('errors on unknown operator', () => {
    const r = parseSql("SELECT * FROM domain WHERE label != 'x'");
    expect(r.ok).toBe(false);
  });

  it('reports position on error', () => {
    const r = parseSql('SELECT * FROM');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(typeof r.position).toBe('number');
  });

  it('errors on trailing garbage', () => {
    const r = parseSql('SELECT * FROM domain FOOBAR');
    expect(r.ok).toBe(false);
  });

  it('gives a clear error for OR conditions', () => {
    const r = parseSql("SELECT * FROM domain WHERE label == 'a' OR status == 1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('OR is not supported');
  });

  it('rejects float LIMIT values', () => {
    const r = parseSql('SELECT * FROM domain LIMIT 25.5');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('integer');
  });
});

// ── resolveContractAlias ───────────────────────────────────────────────

describe('resolveContractAlias', () => {
  it('resolves dpns', () => {
    expect(resolveContractAlias('dpns')).toBe('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec');
  });

  it('resolves dashpay', () => {
    expect(resolveContractAlias('dashpay')).toBe('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7');
  });

  it('is case-insensitive', () => {
    expect(resolveContractAlias('DPNS')).toBe(resolveContractAlias('dpns'));
  });

  it('returns undefined for unknown alias', () => {
    expect(resolveContractAlias('unknown')).toBeUndefined();
  });
});

// ── toDocumentsQuery ───────────────────────────────────────────────────

describe('toDocumentsQuery', () => {
  const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

  it('converts a simple SELECT', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.dataContractId).toBe(contractId);
    expect(q.documentTypeName).toBe('domain');
    expect(q.where).toBeUndefined();
    expect(q.orderBy).toBeUndefined();
    expect(q.limit).toBe(25);
  });

  it('converts WHERE conditions to SDK tuples', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [
        { field: 'label', operator: '==', value: 'test' },
        { field: 'price', operator: '>=', value: 100 },
      ],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([
      ['label', '==', 'test'],
      ['price', '>=', 100],
    ]);
  });

  it('converts BETWEEN to SDK format', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [{ field: 'amount', operator: 'between', value: [10, 100] }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['amount', 'Between', [10, 100]]]);
  });

  it('converts STARTS WITH to SDK format', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [{ field: 'label', operator: 'startsWith', value: 'dash' }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['label', 'startsWith', 'dash']]);
  });

  it('converts IN to SDK format', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [{ field: 'label', operator: 'in', value: ['a', 'b'] }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['label', 'in', ['a', 'b']]]);
  });

  it('converts ORDER BY', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [],
      orderBy: [{ field: 'label', direction: 'desc' }],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.orderBy).toEqual([['label', 'desc']]);
  });

  it('passes limit through', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [],
      orderBy: [],
      limit: 10,
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.limit).toBe(10);
  });

  it('applies startAfter override', () => {
    const parsed: ParsedQuery = {
      select: 'documents',
      from: 'domain',
      where: [],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId, { startAfter: 'cursor123' });
    expect(q.startAfter).toBe('cursor123');
  });
});

describe('workspace SQL validation', () => {
  it.each([
    'SELECT label FROM domain',
    'SELECT DISTINCT label FROM domain',
    'SELECT * FROM domain JOIN owner',
    "SELECT * FROM domain WHERE label = 'a' OR label = 'b'",
    'SELECT * FROM domain OFFSET 10',
    'SELECT * FROM domain GROUP BY label',
    'SELECT * FROM domain LIMIT 0',
    'SELECT * FROM domain LIMIT -1',
    'SELECT * FROM domain LIMIT 101',
    'SELECT * FROM domain WHERE amount = 9007199254740993',
    'SELECT * FROM domain WHERE amount = 9007199254740990.5',
    'SELECT * FROM domain WHERE amount = 0.' + '0'.repeat(400) + '1',
    'SELECT * FROM domain WHERE amount = 1.2.3',
    "SELECT * FROM domain WHERE label = 'unterminated",
    'SELECT * FROM `unterminated',
  ])('rejects unsupported or lossy SQL: %s', (sql) => {
    expect(parseSql(sql).ok).toBe(false);
    expect(parseSqlMulti(sql).ok).toBe(false);
  });

  it('preserves error offsets for leading whitespace', () => {
    const parsed = parseSql('  SELECT label FROM domain');
    expect(parsed).toEqual(expect.objectContaining({ ok: false, position: 9 }));
  });

  it('parses nested aggregate properties', () => {
    const parsed = parseSql('SELECT SUM(stats.score) FROM grade');
    expect(parsed).toEqual(
      expect.objectContaining({
        ok: true,
        query: expect.objectContaining({ aggregateField: 'stats.score' }),
      }),
    );
  });
});


it('preserves escaped SQL identifier punctuation', () => {
  const parsed = parseSql('SELECT * FROM `odd``name` ORDER BY `group` ASC LIMIT 25');
  expect(parsed).toEqual(expect.objectContaining({ ok: true, query: expect.objectContaining({ from: 'odd`name' }) }));
});

describe('SQL edge cases', () => {
  const error = (sql: string) => {
    const parsed = parseSql(sql);
    if (parsed.ok) throw new Error(`expected ${sql} to fail`);
    return parsed;
  };

  it('asks for quotes around an unquoted base58 ID that starts with a digit', () => {
    const sql = 'SELECT * FROM domain WHERE $ownerId = 4EfA9Jrvv3nnCFdSf7fad59851iiTRZ6Wcu6YVJ4iSeF';
    expect(error(sql)).toEqual({
      ok: false,
      message: "Unquoted value '4EfA9Jrvv3nnCFdSf7fad59851iiTRZ6Wcu6YVJ4iSeF'. Write string values, including IDs, in single quotes: '4EfA9Jrvv3nnCFdSf7fad59851iiTRZ6Wcu6YVJ4iSeF'.",
      position: sql.indexOf('4EfA'),
    });
  });

  it('reads unquoted and backticked values as text, with a hint to quote them', () => {
    const sql = "SELECT * FROM doc WHERE x = y AND z IN (a, 'b', y)";
    expect(parseSql(sql)).toEqual({
      ok: true,
      query: expect.objectContaining({
        where: [
          { field: 'x', operator: '==', value: 'y' },
          { field: 'z', operator: 'in', value: ['a', 'b', 'y'] },
        ],
      }),
      hints: [{ message: "Read 'y', 'a' as text, not as fields. Put string values, including IDs, in single quotes.", position: sql.indexOf('y') }],
    });
    expect(parseSqlMulti("SELECT * FROM doc WHERE x = `it's`")).toEqual(
      expect.objectContaining({
        hints: [{ message: "Read 'it''s' as text, not as a field. Put string values, including IDs, in single quotes; backticks are for field names.", position: 28 }],
      }),
    );
    expect(parseSql("SELECT * FROM doc WHERE x = 'y'")).toEqual(expect.objectContaining({ hints: [] }));
    const many = parseSql('SELECT * FROM doc WHERE x IN (a, b, c, d, e)');
    expect(many.ok && many.hints[0]!.message).toMatch(/^Read 'a', 'b', 'c' and 2 more as text, not as fields\./);
  });

  it('allows a field named like, and LIKE in operator position', () => {
    expect(parseSql("SELECT * FROM doc WHERE like = 'x' ORDER BY like DESC")).toEqual(
      expect.objectContaining({
        ok: true,
        query: expect.objectContaining({ where: [{ field: 'like', operator: '==', value: 'x' }], orderBy: [{ field: 'like', direction: 'desc' }] }),
      }),
    );
    expect(parseSql("SELECT * FROM doc WHERE like LIKE 'a%'")).toEqual(
      expect.objectContaining({ ok: true, query: expect.objectContaining({ where: [{ field: 'like', operator: 'startsWith', value: 'a' }] }) }),
    );
  });

  it('treats -- as a comment even straight after an operator', () => {
    // `x==--1` never parsed before comments were supported (the stray `-` was rejected).
    expect(error('SELECT * FROM doc WHERE x==--1')).toEqual({ ok: false, message: "Expected value, got ''", position: 30 });
    expect(parseSql('SELECT * FROM doc WHERE x == -1')).toEqual(
      expect.objectContaining({ ok: true, query: expect.objectContaining({ where: [{ field: 'x', operator: '==', value: -1 }] }) }),
    );
  });

  it('reports malformed numbers as syntax errors', () => {
    const sql = 'SELECT * FROM doc WHERE amount = 1.2.3';
    expect(error(sql)).toEqual({ ok: false, message: "Invalid number '1.2.3'.", position: sql.indexOf('1.2.3') });
    expect(parseSql('SELECT * FROM doc WHERE amount = 1. LIMIT 10.')).toEqual(
      expect.objectContaining({ ok: true, query: expect.objectContaining({ where: [{ field: 'amount', operator: '==', value: 1 }], limit: 10 }) }),
    );
  });

  it('ignores -- line comments', () => {
    const parsed = parseSqlMulti("-- newest names\nSELECT * FROM domain -- the DPNS type\nWHERE label = 'a--b' -- trailing\n; -- done");
    expect(parsed).toEqual(expect.objectContaining({ ok: true }));
    if (!parsed.ok) return;
    expect(parsed.queries).toHaveLength(1);
    expect(parsed.queries[0]!.where).toEqual([{ field: 'label', operator: '==', value: 'a--b' }]);
    expect(parseSql('SELECT * FROM doc WHERE x > -5 -- negative')).toEqual(
      expect.objectContaining({ ok: true, query: expect.objectContaining({ where: [{ field: 'x', operator: '>', value: -5 }] }) }),
    );
  });

  it('rejects inequality and NOT with explanations', () => {
    expect(error("SELECT * FROM doc WHERE x != 'a'").message).toMatch(/^'!=' is not supported — Platform queries/);
    expect(error("SELECT * FROM doc WHERE x <> 'a'").message).toMatch(/^'<>' is not supported/);
    expect(error("SELECT * FROM doc WHERE x NOT IN ('a')").message).toMatch(/^NOT is not supported/);
    expect(error("SELECT * FROM doc WHERE NOT x = 'a'").message).toMatch(/^NOT is not supported/);
    expect(error("SELECT * FROM doc WHERE x NOT LIKE 'a%'").message).toMatch(/^NOT is not supported/);
  });

  it('maps a LIKE prefix pattern to startsWith', () => {
    const parsed = parseSql("SELECT * FROM domain WHERE normalizedLabel like 'ali%' ORDER BY normalizedLabel");
    expect(parsed).toEqual(expect.objectContaining({ ok: true }));
    if (!parsed.ok) return;
    expect(parsed.query.where).toEqual([{ field: 'normalizedLabel', operator: 'startsWith', value: 'ali' }]);
  });

  it.each([
    ["LIKE '%ali'", /^Only prefix patterns are supported/],
    ["LIKE 'a_i%'", /^Only prefix patterns are supported/],
    ["LIKE '%'", /^Only prefix patterns are supported/],
    ["LIKE 'a%b'", /^Only prefix patterns are supported/],
    ["LIKE 'alice'", /^LIKE 'alice' has no wildcard; use = 'alice'/],
    ['LIKE 5', /^LIKE needs a quoted pattern/],
  ])('rejects %s', (clause, message) => {
    expect(error(`SELECT * FROM domain WHERE normalizedLabel ${clause}`).message).toMatch(message);
  });
});

describe('compatibility with queries written for the earlier parser', () => {
  // Generated by running the parser from main (557cb8d) over the presets and
  // older-style queries; saved queries, history and share links rely on them.
  it.each(mainCorpus)('parses $sql to the same SDK parameters', ({ sql, params }) => {
    const parsed = parseSqlMulti(sql);
    if (!parsed.ok) throw new Error(parsed.message);
    const current = parsed.queries.map((q) => toDocumentsQuery(q, 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'));
    expect(JSON.parse(JSON.stringify(current))).toEqual(params);
  });
});
