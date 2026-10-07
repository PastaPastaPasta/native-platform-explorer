import { describe, expect, it } from 'vitest';
import { aggregateProof, classifyProof, describeProofState, getQuorumKeySource, isProofVerificationError, type ProofState } from '../proofs';

describe('classifyProof', () => {
  it('returns unverified-no-variant when the method has no proof sibling', () => {
    const r = classifyProof(
      { status: 'success', data: 1, error: null, fetchStatus: 'idle', dataUpdatedAt: 1234 },
      { trusted: true, hasProofVariant: false },
    );
    expect(r.kind).toBe('unverified-no-variant');
  });

  it('returns unverified-trusted-off when trusted mode is disabled', () => {
    const r = classifyProof(
      { status: 'success', data: 1, error: null, fetchStatus: 'idle', dataUpdatedAt: 1234 },
      { trusted: false, hasProofVariant: true },
    );
    expect(r.kind).toBe('unverified-trusted-off');
  });

  it('distinguishes unavailable queries from failed verification', () => {
    const r = classifyProof(
      { status: 'error', data: undefined, error: new Error('x'), fetchStatus: 'idle', dataUpdatedAt: 1234 },
      { trusted: true, hasProofVariant: true },
    );
    expect(r).toEqual({ kind: 'unavailable', error: 'x' });
  });

  it('returns in-flight while pending or fetching', () => {
    const r = classifyProof(
      { status: 'pending', data: undefined, error: null, fetchStatus: 'fetching', dataUpdatedAt: 0 },
      { trusted: true, hasProofVariant: true },
    );
    expect(r.kind).toBe('unverified-in-flight');
  });

  it('returns verified when trusted + variant + success', () => {
    const r = classifyProof(
      { status: 'success', data: { ok: true }, error: null, fetchStatus: 'idle', dataUpdatedAt: 1234 },
      { trusted: true, hasProofVariant: true },
    );
    expect(r.kind).toBe('verified');
  });
  it('retains the original timestamp while refreshing cached data', () => {
    const query = { status: 'success' as const, data: null, error: null, fetchStatus: 'fetching' as const, dataUpdatedAt: 1234 };
    expect(classifyProof(query, { trusted: true, hasProofVariant: true })).toEqual({ kind: 'verified', verifiedAt: 1234 });
    expect(classifyProof(query, { trusted: true, hasProofVariant: true })).toEqual({ kind: 'verified', verifiedAt: 1234 });
  });

  it('only labels explicit verification errors as failed', () => {
    expect(classifyProof({ status: 'error', data: undefined, error: new Error('Proof verification failed: root mismatch'), fetchStatus: 'idle', dataUpdatedAt: 0 }, { trusted: true, hasProofVariant: true }).kind).toBe('failed');
    expect(isProofVerificationError(new Error('proof endpoint unavailable'))).toBe(false);
    expect(isProofVerificationError(new Error('failed to retrieve quorum public key'))).toBe(false);
    expect(isProofVerificationError({ kind: 'InvalidProof' })).toBe(true);
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(isProofVerificationError(a)).toBe(false);
    expect(isProofVerificationError({ code: 123, kind: 'InvalidProof' })).toBe(true);
  });

  it('reports outages even on non-proof methods or with trusted mode off', () => {
    expect(classifyProof({ status: 'error', data: undefined, error: new Error('offline'), fetchStatus: 'idle', dataUpdatedAt: 0 }, { trusted: false, hasProofVariant: false }).kind).toBe('unavailable');
  });

  it('identifies the configured quorum-key service', () => {
    expect(getQuorumKeySource('testnet', true)).toBe('https://quorums.testnet.networks.dash.org');
    expect(getQuorumKeySource('devnet-paloma', true)).toBe('https://quorums.paloma.networks.dash.org');
    expect(getQuorumKeySource('mainnet', false)).toContain('trusted mode off');
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
