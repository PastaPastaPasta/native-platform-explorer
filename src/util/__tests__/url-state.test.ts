import { describe, expect, it } from 'vitest';
import {
  cursorStackParser,
  epochIndexParser,
  isoDayParser,
  MAX_CURSOR_PAGES,
  pageParser,
  pollWindowParser,
  resolveEpochRange,
  sanitizeCursorStack,
  savedKindParser,
  savedScopeParser,
} from '../url-state';

const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

describe('URL state parsers', () => {
  it('accepts only whole epoch indexes in range', () => {
    expect(epochIndexParser.parse('0')).toBe(0);
    expect(epochIndexParser.parse('65279')).toBe(65279);
    for (const bad of ['-1', '1.5', '65280', 'abc', '', '1e3']) expect(epochIndexParser.parse(bad)).toBeNull();
    expect(epochIndexParser.serialize(42)).toBe('42');
  });

  it('defaults the epoch range to the 20 epochs ending at the current one', () => {
    expect(resolveEpochRange({ from: null, to: null }, 100)).toEqual({ from: 81, to: 100 });
    expect(resolveEpochRange({ from: null, to: 10 }, 100)).toEqual({ from: 0, to: 10 });
    expect(resolveEpochRange({ from: 5, to: 7 }, undefined)).toEqual({ from: 5, to: 7 });
    expect(resolveEpochRange({ from: null, to: null }, undefined)).toEqual({ from: undefined, to: undefined });
  });

  it('parses 1-based pages and real calendar days', () => {
    expect(pageParser.parse('3')).toBe(3);
    expect(pageParser.parse('0')).toBeNull();
    expect(pageParser.parse('x')).toBeNull();
    expect(isoDayParser.parse('2026-11-01')).toBe('2026-11-01');
    expect(isoDayParser.parse('2026-02-30')).toBeNull();
    expect(isoDayParser.parse('2026-1-1')).toBeNull();
  });

  it('restricts literal filters to known values', () => {
    expect(pollWindowParser.parse('7d')).toBe('7d');
    expect(pollWindowParser.parse('8d')).toBeNull();
    expect(savedScopeParser.parse('all')).toBe('all');
    expect(savedScopeParser.parse('nope')).toBeNull();
    expect(savedKindParser.parse('token')).toBe('token');
  });

  it('keeps only identifier cursors and drops implausibly deep stacks', () => {
    expect(cursorStackParser.parse(`${id},${id}`)).toEqual([id, id]);
    expect(cursorStackParser.serialize([id, id])).toBe(`${id},${id}`);
    expect(sanitizeCursorStack(Array(MAX_CURSOR_PAGES + 1).fill(id))).toEqual([]);
    expect(sanitizeCursorStack([id])).toEqual([id]);
  });
});
