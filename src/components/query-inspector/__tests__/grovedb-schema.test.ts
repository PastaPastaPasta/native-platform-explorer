import { describe, expect, it } from 'vitest';
import { decodeGroveKey } from '../grovedb-schema';

describe('decodeGroveKey', () => {
  it('decodes single printable and hex root keys', () => {
    expect(decodeGroveKey('@', 'root')).toMatchObject({ name: 'DataContractDocuments (@)', nextContext: 'data-contract' });
    expect(decodeGroveKey('0x20', 'root')).toMatchObject({ name: 'Identities', nextContext: 'identity' });
    expect(decodeGroveKey('c', 'votes').name).toBe("'c' ContestedResource");
  });

  it('decodes multi-character printable document type names', () => {
    expect(decodeGroveKey('domain', 'contract-documents')).toMatchObject({
      name: "'domain' (document type)",
      nextContext: 'document-type',
    });
    expect(decodeGroveKey('a', 'contract-documents').name).toBe("'a' (document type)");
    // Keys with bytes outside the printable set arrive as hex.
    expect(decodeGroveKey('0x646f6d61696e', 'contract-documents').name).toBe("'domain' (document type)");
  });

  it('follows index property and value levels', () => {
    expect(decodeGroveKey('0x00', 'document-type').nextContext).toBe('document-primary');
    expect(decodeGroveKey('normalizedLabel', 'document-type')).toMatchObject({
      name: "'normalizedLabel' (index property)",
      nextContext: 'index-property',
    });
    expect(decodeGroveKey('dash', 'index-property')).toMatchObject({ name: "'dash' (indexed value)", nextContext: 'index-value' });
    expect(decodeGroveKey('0xff01', 'index-property')).toMatchObject({ name: 'indexed value', nextContext: 'index-value' });
    expect(decodeGroveKey('records', 'index-value').nextContext).toBe('index-property');
    expect(decodeGroveKey('0x00', 'index-value')).toMatchObject({ name: 'Index terminator', nextContext: 'index-references' });
  });

  it('only treats hex-printed 32-byte keys as identifiers', () => {
    const id = `0x${'ab'.repeat(32)}`;
    expect(decodeGroveKey(id, 'data-contract')).toMatchObject({ isIdentifier: true, nextContext: 'contract-id' });
    expect(decodeGroveKey(id, 'index-references')).toMatchObject({ isIdentifier: true, name: '32-byte document ID' });
    // A 32-character label is text, not an identifier.
    const label = 'abcdefghijklmnopqrstuvwxyz012345';
    expect(decodeGroveKey(label, 'index-property')).toMatchObject({ isIdentifier: false, name: `'${label}' (indexed value)` });
  });

  it('accepts every printable key character, including brackets', () => {
    expect(decodeGroveKey('a[b]/c\\d-e_f@', 'contract-documents').name).toBe("'a[b]/c\\d-e_f@' (document type)");
    expect(decodeGroveKey('has space', 'contract-documents')).toEqual({ raw: 'has space', isIdentifier: false });
  });
});
