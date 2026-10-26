import { beforeAll, describe, expect, it } from 'vitest';
import { Document, wallet } from '@dashevo/evo-sdk';
import { safeStringify } from '../wasm-json';

const CONTRACT = 'MUpGibGKT9T5TDYSrcjKBUZgPSNiwVosg4RKktkYJoK';
const OWNER = '7ysNPVoaVZvHWAC7hGn3EmYsbyzizfu8a9Teq3zF6atm';
const DOC = '3CsVRqBULGugMNAJBHSWD4J5DQptWdxuq6FqF76NMVyN';

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
});

describe('safeStringify', () => {
  it('shows the identifiers of a real SDK document as base58', () => {
    const document = new Document({
      properties: { title: 'qa doc two' },
      documentTypeName: 'item',
      dataContractId: CONTRACT,
      ownerId: OWNER,
      id: DOC,
      revision: 2n,
    });
    const json = JSON.parse(safeStringify(document)) as Record<string, unknown>;
    expect(json).toMatchObject({ id: DOC, ownerId: OWNER, dataContractId: CONTRACT, revision: '2' });
    expect(safeStringify(document)).not.toContain('"__type": "Identifier"');
  });
});
