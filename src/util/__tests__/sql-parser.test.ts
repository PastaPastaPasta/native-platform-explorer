import { describe, expect, it } from 'vitest';
import {
  parseSql,
  resolveContractAlias,
  toDocumentsQuery,
  type ParsedQuery,
} from '../sql-parser';

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
    const r = parseSql('select * from domain where label == \'x\' order by label asc limit 10');
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
    expect(r.query.where).toEqual([
      { field: 'label', operator: '==', value: 'test' },
    ]);
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
    expect(r.query.where).toEqual([
      { field: 'price', operator: '>=', value: 100 },
    ]);
  });

  it('parses WHERE with multiple AND conditions', () => {
    const r = parseSql(
      "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel startsWith 'a'",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toHaveLength(2);
    expect(r.query.where[0]).toEqual({
      field: 'normalizedParentDomainName', operator: '==', value: 'dash',
    });
    expect(r.query.where[1]).toEqual({
      field: 'normalizedLabel', operator: 'startsWith', value: 'a',
    });
  });

  it('parses BETWEEN', () => {
    const r = parseSql('SELECT * FROM tx WHERE amount BETWEEN 10 AND 100');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([
      { field: 'amount', operator: 'between', value: [10, 100] },
    ]);
  });

  it('parses IN with value list', () => {
    const r = parseSql("SELECT * FROM domain WHERE label IN ('a', 'b', 'c')");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.where).toEqual([
      { field: 'label', operator: 'in', value: ['a', 'b', 'c'] },
    ]);
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
    expect(r.query.where).toEqual([
      { field: 'label', operator: 'startsWith', value: 'dash' },
    ]);
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
      select: 'documents', from: 'domain', where: [], orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.dataContractId).toBe(contractId);
    expect(q.documentTypeName).toBe('domain');
    expect(q.where).toBeUndefined();
    expect(q.orderBy).toBeUndefined();
    expect(q.limit).toBeUndefined();
  });

  it('converts WHERE conditions to SDK tuples', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain',
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
      select: 'documents', from: 'domain',
      where: [{ field: 'amount', operator: 'between', value: [10, 100] }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['amount', 'Between', [10, 100]]]);
  });

  it('converts STARTS WITH to SDK format', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain',
      where: [{ field: 'label', operator: 'startsWith', value: 'dash' }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['label', 'startsWith', 'dash']]);
  });

  it('converts IN to SDK format', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain',
      where: [{ field: 'label', operator: 'in', value: ['a', 'b'] }],
      orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.where).toEqual([['label', 'in', ['a', 'b']]]);
  });

  it('converts ORDER BY', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain', where: [],
      orderBy: [{ field: 'label', direction: 'desc' }],
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.orderBy).toEqual([['label', 'desc']]);
  });

  it('passes limit through', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain', where: [], orderBy: [], limit: 10,
    };
    const q = toDocumentsQuery(parsed, contractId);
    expect(q.limit).toBe(10);
  });

  it('applies startAfter override', () => {
    const parsed: ParsedQuery = {
      select: 'documents', from: 'domain', where: [], orderBy: [],
    };
    const q = toDocumentsQuery(parsed, contractId, { startAfter: 'cursor123' });
    expect(q.startAfter).toBe('cursor123');
  });
});
