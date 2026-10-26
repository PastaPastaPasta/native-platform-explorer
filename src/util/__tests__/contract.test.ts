import { describe, expect, it } from 'vitest';
import {
  contractHistoryEntries,
  contractKeepsHistory,
  documentTypeKeepsHistory,
  normaliseContract,
  tokenConfigAt,
  tokenPositions,
} from '../contract';

describe('tokenConfigAt', () => {
  const contractRaw = {
    id: 'contractId',
    ownerId: 'ownerId',
    version: 1,
    tokens: {
      '0': {
        baseSupply: 1000n,
        maxSupply: 10000n,
        description: 'first token',
        startAsPaused: true,
        mainControlGroup: 0,
        conventions: {
          decimals: 8,
          localizations: {
            en: { singularForm: 'Coin', pluralForm: 'Coins', shouldCapitalize: true },
            fr: { singularForm: 'Pièce', pluralForm: 'Pièces', shouldCapitalize: true },
          },
        },
      },
      '1': {
        baseSupply: 0n,
        conventions: {
          decimals: 0,
          localizations: {
            ja: { singularForm: '点', pluralForm: '点', shouldCapitalize: false },
          },
        },
      },
    },
  };

  it('extracts name from English singular form when present', () => {
    const c = normaliseContract(contractRaw);
    const cfg = tokenConfigAt(c, 0);
    expect(cfg?.primaryName).toBe('Coin');
    expect(cfg?.decimals).toBe(8);
    expect(cfg?.baseSupply).toBe(1000n);
    expect(cfg?.maxSupply).toBe(10000n);
    expect(cfg?.description).toBe('first token');
    expect(cfg?.startAsPaused).toBe(true);
    expect(cfg?.localizations?.fr?.singularForm).toBe('Pièce');
  });

  it('falls back to any localization when English is missing', () => {
    const c = normaliseContract(contractRaw);
    const cfg = tokenConfigAt(c, 1);
    expect(cfg?.primaryName).toBe('点');
    expect(cfg?.decimals).toBe(0);
  });

  it('returns null for unknown position', () => {
    const c = normaliseContract(contractRaw);
    expect(tokenConfigAt(c, 99)).toBeNull();
  });

  it('returns null when the contract declares no tokens', () => {
    const c = normaliseContract({ id: 'x', ownerId: 'y', version: 1 });
    expect(tokenConfigAt(c, 0)).toBeNull();
  });

  it('tokenPositions enumerates declared token positions', () => {
    const c = normaliseContract(contractRaw);
    expect(tokenPositions(c).sort()).toEqual(['0', '1']);
  });
});

describe('contract config and history', () => {
  it('reads config flags, keywords and per-type history settings', () => {
    const c = normaliseContract({
      $formatVersion: '1',
      id: 'x',
      version: 3,
      config: { $formatVersion: '1', keepsHistory: true, documentsKeepHistoryContractDefault: true },
      keywords: ['usd', 7],
      description: 'Dash USD',
      documentSchemas: { note: { documentsKeepHistory: false }, issue: {} },
    });
    expect(c.formatVersion).toBe('1');
    expect(contractKeepsHistory(c)).toBe(true);
    expect(c.keywords).toEqual(['usd']);
    expect(c.description).toBe('Dash USD');
    expect(documentTypeKeepsHistory(c, 'note')).toBe(false);
    expect(documentTypeKeepsHistory(c, 'issue')).toBe(true);
    expect(contractKeepsHistory(normaliseContract({ config: {} }))).toBe(false);
  });

  it('orders getHistory versions by block time and keeps the user-defined parts', () => {
    const history = new Map<bigint, unknown>([
      [1790000000000n, { version: 2, documentSchemas: { a: { type: 'object', properties: { b: {} } } }, keywords: ['k'] }],
      [1780000000000n, { version: 1, documentSchemas: { a: { type: 'object' } } }],
    ]);
    expect(contractHistoryEntries(history)).toEqual([
      { timestampMs: 1780000000000, version: 1, definition: { documentSchemas: { a: { type: 'object' } } } },
      { timestampMs: 1790000000000, version: 2, definition: { documentSchemas: { a: { type: 'object', properties: { b: {} } } }, keywords: ['k'] } },
    ]);
    expect(contractHistoryEntries(null)).toEqual([]);
  });
});
