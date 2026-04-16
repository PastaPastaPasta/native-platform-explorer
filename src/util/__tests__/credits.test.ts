import { describe, expect, it } from 'vitest';
import { creditsToDash, formatCredits, CREDITS_PER_DASH } from '../credits';

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
