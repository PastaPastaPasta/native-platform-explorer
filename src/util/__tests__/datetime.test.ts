import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTimeDelta } from '../datetime';

describe('getTimeDelta', () => {
  const now = Date.UTC(2026, 9, 23, 12);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    [-30_000, 30, 'second', '30s ago', '30 seconds ago'],
    [30_000, 30, 'second', 'in 30s', 'in 30 seconds'],
    [-1_000, 1, 'second', '1s ago', '1 second ago'],
    [-500, 1, 'second', '1s ago', '1 second ago'],
    [-60_000, 1, 'minute', '1m ago', '1 minute ago'],
    [-3_600_000, 1, 'hour', '1h ago', '1 hour ago'],
  ] as const)('formats an offset of %i ms', (offset, value, unit, short, full) => {
    expect(getTimeDelta(now + offset)).toEqual({ value, unit, short, full, past: offset < 0 });
  });
});
