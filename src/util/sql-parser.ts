import { type DocumentsQueryParams } from '@sdk/queries';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';

// ── Types ──────────────────────────────────────────────────────────────

export interface ParsedQuery {
  select: 'documents' | 'count';
  from: string;
  contractAlias?: string;
  where: ParsedCondition[];
  orderBy: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
}

export interface ParsedCondition {
  field: string;
  operator: '==' | '>' | '>=' | '<' | '<=' | 'between' | 'in' | 'startsWith';
  value: unknown;
}

export type ParseResult =
  | { ok: true; query: ParsedQuery }
  | { ok: false; message: string; position: number };

// ── Tokenizer ──────────────────────────────────────────────────────────

const TT = {
  Keyword: 0,
  Identifier: 1,
  String: 2,
  Number: 3,
  Operator: 4,
  LParen: 5,
  RParen: 6,
  Comma: 7,
  Star: 8,
  Dot: 9,
  EOF: 10,
} as const;

type TT = (typeof TT)[keyof typeof TT];

interface Token {
  type: TT;
  value: string;
  pos: number;
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER', 'BY', 'GROUP',
  'LIMIT', 'ASC', 'DESC', 'BETWEEN', 'IN', 'STARTS', 'WITH',
  'COUNT', 'NOT', 'NULL', 'TRUE', 'FALSE',
]);

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    // skip whitespace
    if (/\s/.test(sql[i]!)) { i++; continue; }

    const ch = sql[i]!;
    const pos = i;

    // single-char tokens
    if (ch === '(') { tokens.push({ type: TT.LParen, value: '(', pos }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TT.RParen, value: ')', pos }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TT.Comma, value: ',', pos }); i++; continue; }
    if (ch === '*') { tokens.push({ type: TT.Star, value: '*', pos }); i++; continue; }
    if (ch === '.') { tokens.push({ type: TT.Dot, value: '.', pos }); i++; continue; }

    // operators: >=, <=, ==, !=, >, <, =
    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      let op = ch;
      if (i + 1 < sql.length && sql[i + 1] === '=') { op += '='; i++; }
      tokens.push({ type: TT.Operator, value: op, pos });
      i++;
      continue;
    }

    // string literal (single-quoted)
    if (ch === "'") {
      i++;
      let s = '';
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            s += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          s += sql[i];
          i++;
        }
      }
      tokens.push({ type: TT.String, value: s, pos });
      continue;
    }

    // numeric literal (including negative when preceded by operator/keyword/comma/lparen or at start)
    if (/[0-9]/.test(ch) || (ch === '-' && i + 1 < sql.length && /[0-9]/.test(sql[i + 1]!) && canBeNegativeNumber(tokens))) {
      let num = ch;
      i++;
      while (i < sql.length && /[0-9.]/.test(sql[i]!)) { num += sql[i]; i++; }
      tokens.push({ type: TT.Number, value: num, pos });
      continue;
    }

    // backtick-quoted identifier
    if (ch === '`') {
      i++;
      let id = '';
      while (i < sql.length && sql[i] !== '`') { id += sql[i]; i++; }
      if (i < sql.length) i++; // consume closing backtick
      tokens.push({ type: TT.Identifier, value: id, pos });
      continue;
    }

    // identifier or keyword
    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (i < sql.length && /[a-zA-Z0-9_$]/.test(sql[i]!)) { id += sql[i]; i++; }
      const upper = id.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: TT.Keyword, value: upper, pos });
      } else {
        tokens.push({ type: TT.Identifier, value: id, pos });
      }
      continue;
    }

    // unknown character — emit as-is for error reporting
    tokens.push({ type: TT.Identifier, value: ch, pos });
    i++;
  }

  tokens.push({ type: TT.EOF, value: '', pos: sql.length });
  return tokens;
}

function canBeNegativeNumber(tokens: Token[]): boolean {
  if (tokens.length === 0) return true;
  const last = tokens[tokens.length - 1]!;
  return last.type === TT.Operator || last.type === TT.Keyword ||
         last.type === TT.Comma || last.type === TT.LParen;
}

// ── Parser ─────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ParseResult {
    try {
      const query = this.parseQuery();
      this.expect(TT.EOF, 'end of query');
      return { ok: true, query };
    } catch (e) {
      if (e instanceof ParseError) {
        return { ok: false, message: e.message, position: e.position };
      }
      throw e;
    }
  }

  private parseQuery(): ParsedQuery {
    this.expectKeyword('SELECT');
    const select = this.parseSelectList();

    this.expectKeyword('FROM');
    const { docType, alias } = this.parseFromClause();

    let where: ParsedCondition[] = [];
    if (this.peekKeyword('WHERE')) {
      this.advance();
      where = this.parseConditions();
    }

    let orderBy: ParsedQuery['orderBy'] = [];
    if (this.peekKeyword('ORDER')) {
      this.advance();
      this.expectKeyword('BY');
      orderBy = this.parseOrderByList();
    }

    let limit: number | undefined;
    if (this.peekKeyword('LIMIT')) {
      this.advance();
      limit = this.expectNumber();
    }

    return { select, from: docType, contractAlias: alias, where, orderBy, limit };
  }

  private parseSelectList(): 'documents' | 'count' {
    if (this.peek().type === TT.Star) {
      this.advance();
      return 'documents';
    }
    if (this.peekKeyword('COUNT')) {
      this.advance();
      this.expect(TT.LParen, '(');
      this.expect(TT.Star, '*');
      this.expect(TT.RParen, ')');
      return 'count';
    }
    // bare field list — treat as documents select
    // (skip field names until we hit FROM)
    while (!this.peekKeyword('FROM') && this.peek().type !== TT.EOF) {
      this.advance();
    }
    return 'documents';
  }

  private parseFromClause(): { docType: string; alias?: string } {
    const first = this.expectIdentifier();
    if (this.peek().type === TT.Dot) {
      this.advance();
      const second = this.expectIdentifier();
      return { docType: second, alias: first };
    }
    return { docType: first };
  }

  private parseConditions(): ParsedCondition[] {
    const conditions: ParsedCondition[] = [this.parseCondition()];
    while (this.peekKeyword('AND')) {
      this.advance();
      conditions.push(this.parseCondition());
    }
    if (this.peekKeyword('OR')) {
      throw new ParseError('OR is not supported — Dash Platform requires all conditions to use AND', this.peek().pos);
    }
    return conditions;
  }

  private parseCondition(): ParsedCondition {
    const field = this.parseFieldPath();

    if (this.peekKeyword('BETWEEN')) {
      this.advance();
      const low = this.parseValue();
      this.expectKeyword('AND');
      const high = this.parseValue();
      return { field, operator: 'between', value: [low, high] };
    }

    if (this.peekKeyword('IN')) {
      this.advance();
      this.expect(TT.LParen, '(');
      const values = this.parseValueList();
      this.expect(TT.RParen, ')');
      return { field, operator: 'in', value: values };
    }

    if (this.peekKeyword('STARTS')) {
      this.advance();
      this.expectKeyword('WITH');
      const value = this.parseValue();
      return { field, operator: 'startsWith', value };
    }

    // also accept startsWith as a single identifier (case-insensitive)
    if (this.peek().type === TT.Identifier && this.peek().value.toLowerCase() === 'startswith') {
      this.advance();
      const value = this.parseValue();
      return { field, operator: 'startsWith', value };
    }

    const op = this.parseOperator();
    const value = this.parseValue();
    return { field, operator: op, value };
  }

  private parseFieldPath(): string {
    let path = this.expectIdentifier();
    while (this.peek().type === TT.Dot) {
      this.advance();
      path += '.' + this.expectIdentifier();
    }
    return path;
  }

  private parseOperator(): ParsedCondition['operator'] {
    const tok = this.peek();
    if (tok.type === TT.Operator) {
      this.advance();
      switch (tok.value) {
        case '=': case '==': return '==';
        case '>': return '>';
        case '>=': return '>=';
        case '<': return '<';
        case '<=': return '<=';
        default: throw new ParseError(`Unknown operator '${tok.value}'`, tok.pos);
      }
    }
    throw new ParseError(`Expected operator, got '${tok.value}'`, tok.pos);
  }

  private parseValue(): unknown {
    const tok = this.peek();
    if (tok.type === TT.String) { this.advance(); return tok.value; }
    if (tok.type === TT.Number) { this.advance(); return parseFloat(tok.value); }
    if (tok.type === TT.Keyword && tok.value === 'TRUE') { this.advance(); return true; }
    if (tok.type === TT.Keyword && tok.value === 'FALSE') { this.advance(); return false; }
    if (tok.type === TT.Keyword && tok.value === 'NULL') { this.advance(); return null; }
    // allow unquoted identifiers as string values (e.g. base58 IDs)
    if (tok.type === TT.Identifier) { this.advance(); return tok.value; }
    throw new ParseError(`Expected value, got '${tok.value}'`, tok.pos);
  }

  private parseValueList(): unknown[] {
    const values: unknown[] = [this.parseValue()];
    while (this.peek().type === TT.Comma) {
      this.advance();
      values.push(this.parseValue());
    }
    return values;
  }

  private parseOrderByList(): ParsedQuery['orderBy'] {
    const items: ParsedQuery['orderBy'] = [this.parseOrderByItem()];
    while (this.peek().type === TT.Comma) {
      this.advance();
      items.push(this.parseOrderByItem());
    }
    return items;
  }

  private parseOrderByItem(): { field: string; direction: 'asc' | 'desc' } {
    const field = this.parseFieldPath();
    let direction: 'asc' | 'desc' = 'asc';
    if (this.peekKeyword('ASC')) { this.advance(); direction = 'asc'; }
    else if (this.peekKeyword('DESC')) { this.advance(); direction = 'desc'; }
    return { field, direction };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    return this.tokens[this.pos++]!;
  }

  private expect(type: TT, label: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new ParseError(`Expected ${label}, got '${tok.value}'`, tok.pos);
    }
    return this.advance();
  }

  private expectKeyword(kw: string): Token {
    const tok = this.peek();
    if (tok.type !== TT.Keyword || tok.value !== kw) {
      throw new ParseError(`Expected '${kw}', got '${tok.value}'`, tok.pos);
    }
    return this.advance();
  }

  private expectIdentifier(): string {
    const tok = this.peek();
    if (tok.type !== TT.Identifier) {
      throw new ParseError(`Expected identifier, got '${tok.value}'`, tok.pos);
    }
    this.advance();
    return tok.value;
  }

  private expectNumber(): number {
    const tok = this.peek();
    if (tok.type !== TT.Number) {
      throw new ParseError(`Expected number, got '${tok.value}'`, tok.pos);
    }
    this.advance();
    const n = Number(tok.value);
    if (!Number.isInteger(n)) {
      throw new ParseError(`Expected integer, got '${tok.value}'`, tok.pos);
    }
    return n;
  }

  private peekKeyword(kw: string): boolean {
    const tok = this.peek();
    return tok.type === TT.Keyword && tok.value === kw;
  }
}

class ParseError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function parseSql(sql: string): ParseResult {
  const tokens = tokenize(sql.trim());
  return new Parser(tokens).parse();
}

// ── Contract alias resolution ──────────────────────────────────────────

const ALIAS_MAP = new Map<string, string>(
  SYSTEM_DATA_CONTRACTS
    .filter((c) => c.testnetId)
    .map((c) => [c.key.toLowerCase(), c.testnetId]),
);

export function resolveContractAlias(alias: string): string | undefined {
  return ALIAS_MAP.get(alias.toLowerCase());
}

// ── SDK param conversion ───────────────────────────────────────────────

function conditionToWhere(c: ParsedCondition): [string, string, unknown] {
  switch (c.operator) {
    case 'between':
      return [c.field, 'Between', c.value];
    case 'in':
      return [c.field, 'in', c.value];
    case 'startsWith':
      return [c.field, 'startsWith', c.value];
    default:
      return [c.field, c.operator, c.value];
  }
}

export function toDocumentsQuery(
  parsed: ParsedQuery,
  contractId: string,
  overrides?: { startAfter?: string },
): DocumentsQueryParams {
  return {
    dataContractId: contractId,
    documentTypeName: parsed.from,
    where: parsed.where.length ? parsed.where.map(conditionToWhere) : undefined,
    orderBy: parsed.orderBy.length ? parsed.orderBy.map((o) => [o.field, o.direction]) : undefined,
    limit: parsed.limit,
    startAfter: overrides?.startAfter,
  };
}

export function resolveContractId(
  parsed: ParsedQuery,
  pickerContractId: string | undefined,
): { contractId: string | undefined; source: 'alias' | 'picker' } {
  if (parsed.contractAlias) {
    const resolved = resolveContractAlias(parsed.contractAlias);
    return { contractId: resolved, source: 'alias' };
  }
  return { contractId: pickerContractId, source: 'picker' };
}
