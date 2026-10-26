import { describe, expect, it } from 'vitest';
import { diffJson, summarizeDiff } from '../json-diff';

describe('diffJson', () => {
  it('reports added, removed and changed leaves with readable paths', () => {
    const before = {
      domain: { properties: { label: { type: 'string', maxLength: 63 } }, indices: [{ name: 'a' }] },
      preorder: { type: 'object' },
    };
    const after = {
      domain: { properties: { label: { type: 'string', maxLength: 64 }, note: { type: 'string' } }, indices: [{ name: 'a' }, { name: 'b' }] },
    };
    expect(diffJson(before, after)).toEqual([
      { path: 'domain.indices[1]', kind: 'added', after: { name: 'b' } },
      { path: 'domain.properties.label.maxLength', kind: 'changed', before: 63, after: 64 },
      { path: 'domain.properties.note', kind: 'added', after: { type: 'string' } },
      { path: 'preorder', kind: 'removed', before: { type: 'object' } },
    ]);
  });

  it('quotes keys that are not identifiers and treats equal bigints as unchanged', () => {
    expect(diffJson({ 'a-b': 1n, $id: 2 }, { 'a-b': 1n, $id: 3 })).toEqual([
      { path: '$id', kind: 'changed', before: 2, after: 3 },
    ]);
    expect(diffJson({ 'a-b': 1 }, { 'a-b': 2 })[0]?.path).toBe('["a-b"]');
  });

  it('reports a type change as a change of the whole value', () => {
    expect(diffJson({ a: [1] }, { a: { 0: 1 } })).toEqual([
      { path: 'a', kind: 'changed', before: [1], after: { 0: 1 } },
    ]);
    expect(diffJson(1, 2)).toEqual([{ path: '(root)', kind: 'changed', before: 1, after: 2 }]);
  });

  it('summarizes counts', () => {
    const entries = diffJson({ a: 1, b: 2 }, { a: 2, c: 3 });
    expect(summarizeDiff(entries)).toEqual({ added: 1, removed: 1, changed: 1 });
  });
});
