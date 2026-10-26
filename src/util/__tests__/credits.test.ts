import { describe, expect, it } from 'vitest';
import { creditsToDash, formatCredits, formatDashAmount, CREDITS_PER_DASH } from '../credits';

describe('creditsToDash', () => {
  it('converts 1e11 credits to exactly 1 DASH', () => {
    expect(creditsToDash('100000000000')).toBe('1');
  });

  it('converts 50000 credits to 0.0000005 DASH', () => {
    expect(creditsToDash(50_000)).toBe('0.0000005');
  });

  it('handles zero', () => {
    expect(creditsToDash(0)).toBe('0');
  });

  it('handles bigint inputs', () => {
    expect(creditsToDash(BigInt('250000000000'))).toBe('2.5');
  });

  it('exposes the correct CREDITS_PER_DASH constant', () => {
    expect(CREDITS_PER_DASH.toFixed()).toBe('100000000000');
  });
});

describe('formatCredits', () => {
  it('groups thousands', () => {
    expect(formatCredits(1_000_000_000)).toBe('1,000,000,000');
  });
});

describe('formatDashAmount', () => {
  // Regression: the full 11-decimal total supply overflowed its home stat cell.
  it('rounds down to two decimals with thousands separators', () => {
    expect(formatDashAmount(37_096_374_962_587_832n)).toBe('370,963.74');
    expect(formatDashAmount(0)).toBe('0.00');
    expect(formatDashAmount('150000000000', 0)).toBe('1');
  });
});
