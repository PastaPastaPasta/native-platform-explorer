import { describe, expect, it, vi } from 'vitest';
import type { DocumentsQueryParams } from '@sdk/queries';
import type { ParsedQuery } from '../sql-parser';
import { installStorageMock } from '@/test/storage';
import {
  aggregateExportRows,
  buildSdkExample,
  extractDocumentRows,
  formatAverage,
  loadSavedQueries,
  MAX_SAVED_QUERIES,
  MAX_SAVED_QUERY_NAME_LENGTH,
  MAX_SAVED_QUERY_SQL_LENGTH,
  parseSavedQueries,
  savedQueriesKey,
  saveSavedQueries,
  updateSavedQueries,
  serializeQueryCsv,
  serializeQueryJson,
} from '../query-workspace';

describe('formatAverage', () => {
  it.each([
    [1n, 2n, '0.5'],
    [-1n, 2n, '-0.5'],
    [-1n, 3n, '-0.3333'],
    [-123n, 100n, '-1.23'],
    [123n, 100n, '1.23'],
    [2n, 3n, '0.6666'],
    [0n, 2n, '0'],
    [1n, 0n, '—'],
    [1n, -2n, '-0.5'],
    [-1n, -2n, '0.5'],
    [-1n, 100_000n, '-0'],
  ])('formats %s / %s as %s', (sum, count, expected) => {
    expect(formatAverage(sum, count)).toBe(expected);
  });

  it('keeps every digit of an integer beyond Number precision', () => {
    expect(formatAverage(36_893_488_147_419_103_235n, 2n)).toBe('18446744073709551617.5');
  });
});

describe('serializeQueryJson', () => {
  it('exports nested BigInts, maps, and binary fields without Number conversion', () => {
    const value = new Map([
      ['__proto__', { large: 18_446_744_073_709_551_615n, bytes: new Uint8Array([0, 15, 255]) }],
      ['next', { large: -18_446_744_073_709_551_615n, nested: [1n, new Map([['sum', 2n]])] }],
    ]);
    expect(JSON.parse(serializeQueryJson(value))).toEqual({
      ['__proto__']: { large: '18446744073709551615', bytes: '000fff' },
      next: { large: '-18446744073709551615', nested: ['1', { sum: '2' }] },
    });
  });

  it('honors SDK toJSON and processes its nested return value', () => {
    class Document {
      __wbg_ptr = 23;
      toJSON() {
        return { $id: 'document-id', amount: 9_007_199_254_740_993n };
      }
    }
    expect(JSON.parse(serializeQueryJson([new Document()]))).toEqual([
      { $id: 'document-id', amount: '9007199254740993' },
    ]);
  });

  it('surfaces readable getter state when SDK toJSON throws', () => {
    class Document {
      __wbg_ptr = 23;
      label = 'test';
      toJSON(): never {
        throw new Error('freed field');
      }
      get amount() {
        return 9_007_199_254_740_993n;
      }
      get unavailable(): never {
        throw new Error('freed field');
      }
    }
    expect(JSON.parse(serializeQueryJson(new Document()))).toEqual({
      label: 'test',
      amount: '9007199254740993',
      unavailable: '[Unavailable]',
    });
  });

  it('handles circular references without dropping unrelated values or shared children', () => {
    const shared = { amount: 42n };
    const value: Record<string, unknown> = { first: shared, second: shared };
    value.self = value;
    const map = new Map<string, unknown>([['value', value]]);
    map.set('self', map);
    expect(JSON.parse(serializeQueryJson(map))).toEqual({
      value: { first: { amount: '42' }, second: { amount: '42' }, self: '[Circular]' },
      self: '[Circular]',
    });
  });

  it('handles a toJSON return that refers back to its SDK instance', () => {
    const sdkObject = {
      amount: 42n,
      toJSON() {
        return { sdkObject: this, amount: this.amount };
      },
    };
    expect(JSON.parse(serializeQueryJson(sdkObject))).toEqual({
      sdkObject: '[Circular]',
      amount: '42',
    });
  });

  it('emits valid JSON for strings and missing top-level values', () => {
    expect(serializeQueryJson('hello', 0)).toBe('"hello"');
    expect(serializeQueryJson(undefined)).toBe('null');
  });
});

describe('query export rows', () => {
  it('extracts map and array documents while preserving instances and filtering absent rows', () => {
    class Document {
      get id() {
        return 'doc-id';
      }
    }
    const document = new Document();
    expect(
      extractDocumentRows(
        new Map([
          ['a', document],
          ['b', undefined],
        ]),
      ),
    ).toEqual([document]);
    expect(extractDocumentRows([document, null, 7, []])).toEqual([document]);
    expect(extractDocumentRows({ document })).toEqual([]);
    expect(extractDocumentRows(undefined)).toEqual([]);
  });

  it('exports exact aggregate values and negative averages with canonical group keys', () => {
    const data = new Map([
      ['', { count: 2n, sum: -1n }],
      ['cafe', { count: 2n, sum: 36_893_488_147_419_103_235n }],
    ]);
    expect(aggregateExportRows(data, 'avg')).toEqual([
      { groupKey: '', count: '2', sum: '-1', average: '-0.5' },
      {
        groupKey: 'cafe',
        count: '2',
        sum: '36893488147419103235',
        average: '18446744073709551617.5',
      },
    ]);
    expect(
      JSON.parse(
        serializeQueryJson(
          aggregateExportRows(new Map([['', 18_446_744_073_709_551_615n]]), 'count'),
        ),
      ),
    ).toEqual([{ groupKey: '', count: '18446744073709551615' }]);
    expect(aggregateExportRows(undefined, 'sum')).toEqual([]);
  });
});

describe('serializeQueryCsv', () => {
  it('keeps full integer digits, unions fields, and escapes commas, quotes, and newlines', () => {
    expect(
      serializeQueryCsv([
        {
          amount: 18_446_744_073_709_551_615n,
          note: 'comma, "quote"\nand newline',
          data: { count: 2n },
        },
        { amount: -18_446_744_073_709_551_615n, missing: true },
      ]),
    ).toBe(
      'amount,note,data,missing\r\n' +
        '18446744073709551615,"comma, ""quote""\nand newline","{""count"":""2""}",\r\n' +
        '-18446744073709551615,,,true',
    );
  });

  it.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', ' =1+1', '\t=1+1', '\r=1+1'])(
    'neutralizes a spreadsheet formula %j',
    (text) => {
      const csv = serializeQueryCsv([{ text }]);
      expect(csv).toContain(`'${text}`);
    },
  );

  it('neutralizes formula-like column names too', () => {
    expect(serializeQueryCsv([{ '=1+1': 'safe' }])).toBe("'=1+1\r\nsafe");
  });

  it('normalizes SDK toJSON rows and handles empty results', () => {
    expect(serializeQueryCsv([{ toJSON: () => ({ $id: 'test', sum: 4n }) }])).toBe(
      '$id,sum\r\ntest,4',
    );
    expect(serializeQueryCsv([])).toBe('');
    expect(serializeQueryCsv([{}])).toBe('');
  });
});

const documentQuery: ParsedQuery = { select: 'documents', from: 'domain', where: [], orderBy: [] };
const params: DocumentsQueryParams = {
  dataContractId: 'contract-id',
  documentTypeName: 'domain',
  where: [['amount', '>', 9_007_199_254_740_993n]],
  limit: 25,
};

/** Run copied JavaScript against a facade-shaped SDK double to verify syntax,
 *  connection ordering, preserved parameter types, and the actual API calls. */
async function executeExample(example: string, sdk: unknown) {
  const factories = {
    testnet: vi.fn(() => sdk),
    testnetTrusted: vi.fn(() => sdk),
    mainnet: vi.fn(() => sdk),
    mainnetTrusted: vi.fn(() => sdk),
    devnet: vi.fn(() => sdk),
    devnetTrusted: vi.fn(() => sdk),
  };
  const source = example.replace("import { EvoSDK } from '@dashevo/evo-sdk';", '');
  const log = vi.fn();
  const run = new Function('EvoSDK', 'console', `return (async () => {\n${source}\n})();`) as (
    sdkFactory: unknown,
    console: unknown,
  ) => Promise<void>;
  await run(factories, { log });
  return { factories, log };
}

describe('buildSdkExample', () => {
  it.each(['testnet', 'mainnet'] as const)(
    'uses the %s trusted factory and proof-returning facade',
    async (network) => {
      let connected = false;
      const queryWithProof = vi.fn(async () => {
        expect(connected).toBe(true);
        return { data: new Map([['doc-id', { amount: 9_007_199_254_740_993n }]]) };
      });
      const sdk = {
        connect: async () => {
          connected = true;
        },
        documents: { queryWithProof },
      };
      const example = buildSdkExample(documentQuery, params, network, true);
      const { factories, log } = await executeExample(example, sdk);
      expect(factories[`${network}Trusted`]).toHaveBeenCalledOnce();
      expect(queryWithProof).toHaveBeenCalledWith(params);
      expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({
        'doc-id': { amount: '9007199254740993' },
      });
      expect(example).toContain('@dashevo/evo-sdk@4.0.0-rc.2');
    },
  );

  it('uses the regular facade in untrusted mode', async () => {
    const query = vi.fn(async () => new Map());
    const sdk = { connect: vi.fn(), documents: { query } };
    const { factories } = await executeExample(
      buildSdkExample(documentQuery, params, 'testnet', false),
      sdk,
    );
    expect(factories.testnet).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(params);
  });

  it.each([
    ['count', 'getDocumentsCount'],
    ['sum', 'getDocumentsSum'],
    ['avg', 'getDocumentsAverage'],
  ] as const)('uses the connected WASM SDK for %s', async (select, method) => {
    const aggregateMethod = vi.fn(async () => new Map([['', 2n]]));
    const sdk = {
      connect: vi.fn(),
      getWasmSdkConnected: vi.fn(async () => ({ [method]: aggregateMethod })),
    };
    const parsed = {
      ...documentQuery,
      select,
      aggregateField: select === 'count' ? undefined : 'amount',
    };
    const example = buildSdkExample(parsed, params, 'mainnet', true);
    await executeExample(example, sdk);
    expect(sdk.getWasmSdkConnected).toHaveBeenCalledOnce();
    expect(aggregateMethod.mock.calls[0]).toEqual(
      select === 'count' ? [params] : [params, 'amount'],
    );
    expect(example).toContain('WASM aggregate path without proof capture');
  });

  it('quotes query parameter strings so pasted code cannot execute their content', async () => {
    const untrustedParams = { ...params, documentTypeName: '\"); throw new Error("injected"); //' };
    const query = vi.fn(async () => new Map());
    await executeExample(buildSdkExample(documentQuery, untrustedParams, 'testnet', false), {
      connect: vi.fn(),
      documents: { query },
    });
    expect(query).toHaveBeenCalledWith(untrustedParams);
  });

  it('uses configured devnet DAPI endpoints and a configured trusted quorum URL', async () => {
    const query = vi.fn(async () => new Map());
    const sdk = {
      connect: vi.fn(),
      documents: { query, queryWithProof: async () => ({ data: new Map() }) },
    };
    const network = {
      name: 'custom-network',
      label: 'Custom',
      type: 'devnet' as const,
      devnetName: 'custom',
      dapiAddresses: ['https://127.0.0.1:1443'],
      quorumUrl: 'https://quorums.example.test',
    };
    const untrusted = await executeExample(
      buildSdkExample(documentQuery, params, network, false),
      sdk,
    );
    expect(untrusted.factories.devnet).toHaveBeenCalledWith('custom', {
      addresses: network.dapiAddresses,
    });
    const trusted = await executeExample(
      buildSdkExample(documentQuery, params, network, true),
      sdk,
    );
    expect(trusted.factories.devnetTrusted).toHaveBeenCalledWith('custom', {
      quorumUrl: network.quorumUrl,
    });
    expect(buildSdkExample(documentQuery, params, 'devnet-custom', false)).toContain(
      'Replace DAPI_HOST',
    );
  });
});

describe('saved queries', () => {
  it('does not apply any mutation or write if reading fresh storage is denied', () => {
    const storage = installStorageMock('localStorage');
    const update = vi.fn(() => [{ name: 'Local', sql: 'SELECT * FROM type' }]);
    const set = vi.spyOn(storage, 'setItem');
    const remove = vi.spyOn(storage, 'removeItem');
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(updateSavedQueries('testnet', 'contract', update, storage)).toEqual({
      status: 'unavailable',
    });
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(updateSavedQueries('testnet', 'contract', update, null)).toEqual({
      status: 'unavailable',
    });
  });

  it('validates malformed fresh storage without executing or retaining untrusted fields', () => {
    const storage = installStorageMock('localStorage', {
      [savedQueriesKey('testnet', 'contract')]: '{broken',
    });
    const added = { name: 'Local', sql: 'SELECT * FROM type' };
    expect(
      updateSavedQueries('testnet', 'contract', (queries) => [...queries, added], storage),
    ).toEqual({ status: 'saved', queries: [added] });
    expect(loadSavedQueries('testnet', 'contract', storage)).toEqual([added]);
  });

  it('does not truncate a twenty-first entry or change the persisted list', () => {
    const storage = installStorageMock('localStorage');
    const full = Array.from({ length: MAX_SAVED_QUERIES }, (_, i) => ({
      name: `Saved ${i}`,
      sql: 'SELECT * FROM type',
    }));
    saveSavedQueries('testnet', 'contract', full, storage);
    const write = vi.spyOn(storage, 'setItem');
    expect(
      updateSavedQueries(
        'testnet',
        'contract',
        (queries) => [...queries, { name: 'Extra', sql: 'SELECT * FROM type' }],
        storage,
      ),
    ).toEqual({ status: 'limit', queries: full });
    expect(write).not.toHaveBeenCalled();
    expect(loadSavedQueries('testnet', 'contract', storage)).toEqual(full);
  });

  it('preserves current data when an explicit clear is denied', () => {
    const storage = installStorageMock('localStorage');
    const existing = [{ name: 'Keep', sql: 'SELECT * FROM type' }];
    saveSavedQueries('testnet', 'contract', existing, storage);
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(updateSavedQueries('testnet', 'contract', () => [], storage)).toEqual({
      status: 'unavailable',
    });
    expect(loadSavedQueries('testnet', 'contract', storage)).toEqual(existing);
  });

  it('validates and bounds storage records instead of trusting parsed JSON', () => {
    const entries = [
      null,
      2,
      {},
      { name: 'bad', sql: false },
      { name: ' ', sql: 'SELECT * FROM type' },
      { name: 'long'.repeat(MAX_SAVED_QUERY_NAME_LENGTH), sql: 'SELECT * FROM type' },
      { name: 'long sql', sql: 'a'.repeat(MAX_SAVED_QUERY_SQL_LENGTH + 1) },
      { name: ' First ', sql: 'SELECT * FROM type', ignored: 'drop' },
      { name: 'First', sql: 'SELECT COUNT(*) FROM type' },
      ...Array.from({ length: MAX_SAVED_QUERIES + 5 }, (_, index) => ({
        name: `Saved ${index}`,
        sql: 'SELECT * FROM type',
      })),
    ];
    const saved = parseSavedQueries(JSON.stringify(entries));
    expect(saved).toHaveLength(MAX_SAVED_QUERIES);
    expect(saved[0]).toEqual({ name: 'First', sql: 'SELECT * FROM type' });
    expect(parseSavedQueries('{broken')).toEqual([]);
    expect(parseSavedQueries('{"name":"not an array"}')).toEqual([]);
    expect(parseSavedQueries('x'.repeat(3_000_000))).toEqual([]);
  });

  it('isolates network and contract keys and never persists during load', () => {
    const storage = installStorageMock('localStorage');
    const setItem = vi.spyOn(storage, 'setItem');
    const queries = [{ name: 'Saved', sql: 'SELECT * FROM type' }];
    expect(loadSavedQueries('testnet', 'contract', storage)).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(saveSavedQueries('testnet', 'contract', queries, storage)).toBe(true);
    expect(loadSavedQueries('testnet', 'contract', storage)).toEqual(queries);
    expect(loadSavedQueries('mainnet', 'contract', storage)).toEqual([]);
    expect(loadSavedQueries('testnet', 'another-contract', storage)).toEqual([]);
    expect(savedQueriesKey('a:b', 'c')).not.toBe(savedQueriesKey('a', 'b:c'));
    expect(saveSavedQueries('testnet', 'contract', [], storage)).toBe(true);
    expect(storage.getItem(savedQueriesKey('testnet', 'contract'))).toBeNull();
  });

  it('gracefully handles denied reads, quota failures, and absent storage', () => {
    const failing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const queries = [{ name: 'Saved', sql: 'SELECT * FROM type' }];
    expect(loadSavedQueries('testnet', 'contract', failing)).toEqual([]);
    expect(saveSavedQueries('testnet', 'contract', queries, failing)).toBe(false);
    expect(saveSavedQueries('testnet', 'contract', [], failing)).toBe(false);
    expect(saveSavedQueries('testnet', 'contract', queries, null)).toBe(false);
  });
});

it('roundtrips maximum-sized saved SQL with JSON escaping', () => {
  const storage = installStorageMock('localStorage');
  const queries = Array.from({ length: MAX_SAVED_QUERIES }, (_, index) => ({
    name: `Saved ${index}`,
    sql: '\u0001'.repeat(MAX_SAVED_QUERY_SQL_LENGTH),
  }));
  expect(saveSavedQueries('testnet', 'contract', queries, storage)).toBe(true);
  expect(loadSavedQueries('testnet', 'contract', storage)).toEqual(queries);
});

it('normalizes SDK Documents through toObject before versioned toJSON', async () => {
  const identifier = { __wbg_ptr: 123, toBase58: () => 'doc-id', toJSON: () => 'doc-id' };
  const document = {
    toJSON: () => {
      throw new Error('platform version required');
    },
    toObject: () => ({ $id: identifier, amount: 9007199254740993n }),
  };
  expect(JSON.parse(serializeQueryJson(document))).toEqual({
    $id: 'doc-id',
    amount: '9007199254740993',
  });
  const sdk = {
    connect: vi.fn(),
    documents: { queryWithProof: async () => ({ data: new Map([['doc-id', document]]) }) },
  };
  const { log } = await executeExample(
    buildSdkExample(documentQuery, params, 'testnet', true),
    sdk,
  );
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({
    'doc-id': { $id: 'doc-id', amount: '9007199254740993' },
  });
});
