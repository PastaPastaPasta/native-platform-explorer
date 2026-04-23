import { describe, expect, it } from 'vitest';
import { normaliseContract, tokenConfigAt, tokenPositions } from '../contract';

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
        isStartedAsPaused: false,
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
