import { describe, expect, it } from 'vitest';
import { aggregateProof, classifyProof, describeProofState, type ProofState } from '../proofs';

describe('classifyProof', () => {
  it('returns unverified-no-variant when the method has no proof sibling', () => {
    const r = classifyProof(
      { status: 'success', data: 1, error: null, fetchStatus: 'idle' },
      { trusted: true, hasProofVariant: false },
    );
    expect(r.kind).toBe('unverified-no-variant');
  });

  it('returns unverified-trusted-off when trusted mode is disabled', () => {
    const r = classifyProof(
      { status: 'success', data: 1, error: null, fetchStatus: 'idle' },
      { trusted: false, hasProofVariant: true },
    );
    expect(r.kind).toBe('unverified-trusted-off');
  });

  it('returns failed on error', () => {
    const r = classifyProof(
      { status: 'error', data: undefined, error: new Error('x'), fetchStatus: 'idle' },
      { trusted: true, hasProofVariant: true },
    );
    expect(r.kind).toBe('failed');
    if (r.kind === 'failed') expect(r.error).toBe('x');
  });

  it('returns in-flight while pending or fetching', () => {
    const r = classifyProof(
      { status: 'pending', data: undefined, error: null, fetchStatus: 'fetching' },
      { trusted: true, hasProofVariant: true },
    );
    expect(r.kind).toBe('unverified-in-flight');
  });

  it('returns verified when trusted + variant + success', () => {
    const r = classifyProof(
      { status: 'success', data: { ok: true }, error: null, fetchStatus: 'idle' },
      { trusted: true, hasProofVariant: true },
    );
    expect(r.kind).toBe('verified');
  });
});

describe('aggregateProof', () => {
  const verified: ProofState = { kind: 'verified', verifiedAt: 0 };
  const unverifiedNoVariant: ProofState = { kind: 'unverified-no-variant', reason: 'no-proof-method' };
  const unverifiedTrustedOff: ProofState = { kind: 'unverified-trusted-off', reason: 'trusted-mode-off' };
  const inFlight: ProofState = { kind: 'unverified-in-flight' };
  const failed: ProofState = { kind: 'failed', error: 'boom' };

  it('returns unknown for empty input', () => {
    expect(aggregateProof([]).kind).toBe('unknown');
  });

  it('picks failed over all others', () => {
    expect(aggregateProof([verified, unverifiedNoVariant, failed]).kind).toBe('failed');
  });

  it('picks in-flight over unverified', () => {
    expect(aggregateProof([verified, unverifiedNoVariant, inFlight]).kind).toBe('unverified-in-flight');
  });

  it('picks trusted-off over no-variant', () => {
    expect(aggregateProof([unverifiedNoVariant, unverifiedTrustedOff]).kind).toBe('unverified-trusted-off');
  });

  it('returns verified if every query is verified', () => {
    expect(aggregateProof([verified, verified]).kind).toBe('verified');
  });
});

describe('describeProofState', () => {
  it('includes the error message in failed descriptions', () => {
    expect(describeProofState({ kind: 'failed', error: 'nope' })).toContain('nope');
  });
});
