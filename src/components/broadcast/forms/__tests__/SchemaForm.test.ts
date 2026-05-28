import { describe, expect, it } from 'vitest';
import {
  emptyValueFor,
  issuesToErrorMap,
  validateAgainstSchema,
  type SchemaObject,
} from '../SchemaForm';

const noteSchema: SchemaObject = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 100 },
    body: { type: 'string', maxLength: 4096 },
    pinned: { type: 'boolean' },
    priority: { type: 'integer', minimum: 0, maximum: 10 },
    tags: { type: 'array', items: { type: 'string', maxLength: 16 } },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        handle: { type: 'string', maxLength: 30 },
      },
      required: ['name'],
    },
  },
  required: ['title'],
};

describe('emptyValueFor', () => {
  it('initialises strings to empty and booleans to false', () => {
    const v = emptyValueFor(noteSchema);
    expect(v.title).toBe('');
    expect(v.pinned).toBe(false);
    expect(v.priority).toBe('');
    expect(v.tags).toEqual([]);
    expect(v.author).toEqual({});
  });

  it('skips $-prefixed system fields', () => {
    const v = emptyValueFor({
      type: 'object',
      properties: {
        $id: { type: 'string' },
        $ownerId: { type: 'string' },
        name: { type: 'string' },
      },
    });
    expect(v).toEqual({ name: '' });
    expect('$id' in v).toBe(false);
  });
});

describe('validateAgainstSchema', () => {
  it('reports missing required fields', () => {
    const issues = validateAgainstSchema(noteSchema, {});
    expect(issues.some((i) => i.path === '/title')).toBe(true);
  });

  it('enforces string maxLength', () => {
    const issues = validateAgainstSchema(noteSchema, {
      title: 'a'.repeat(101),
    });
    expect(issues.some((i) => i.path === '/title')).toBe(true);
  });

  it('enforces number minimum/maximum', () => {
    const below = validateAgainstSchema(noteSchema, {
      title: 'ok',
      priority: -1,
    });
    expect(below.some((i) => i.path === '/priority')).toBe(true);

    const above = validateAgainstSchema(noteSchema, {
      title: 'ok',
      priority: 100,
    });
    expect(above.some((i) => i.path === '/priority')).toBe(true);
  });

  it('recurses into nested objects', () => {
    const issues = validateAgainstSchema(noteSchema, {
      title: 'ok',
      author: {}, // missing required `name`
    });
    expect(issues.some((i) => i.path === '/author/name')).toBe(true);
  });

  it('validates array items', () => {
    const issues = validateAgainstSchema(noteSchema, {
      title: 'ok',
      tags: ['a', 'a'.repeat(17)], // second exceeds maxLength=16
    });
    expect(issues.some((i) => i.path === '/tags/1')).toBe(true);
  });

  it('passes on valid input', () => {
    const issues = validateAgainstSchema(noteSchema, {
      title: 'hello',
      body: 'world',
      pinned: true,
      priority: 5,
      tags: ['a', 'b'],
      author: { name: 'alice' },
    });
    expect(issues).toEqual([]);
  });
});

describe('issuesToErrorMap', () => {
  it('flattens issues to a path-keyed map', () => {
    const map = issuesToErrorMap([
      { path: '/foo', message: 'bad' },
      { path: '/bar/baz', message: 'worse' },
    ]);
    expect(map).toEqual({ '/foo': 'bad', '/bar/baz': 'worse' });
  });
});

describe('validateAgainstSchema — additional coverage', () => {
  it('treats integer 0 as a present value, not "missing"', () => {
    const issues = validateAgainstSchema(
      {
        type: 'object',
        properties: { count: { type: 'integer' } },
        required: ['count'],
      },
      { count: 0 },
    );
    expect(issues).toEqual([]);
  });

  it('treats boolean false as a present value', () => {
    const issues = validateAgainstSchema(
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        required: ['flag'],
      },
      { flag: false },
    );
    expect(issues).toEqual([]);
  });
});
