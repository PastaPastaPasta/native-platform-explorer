import { describe, expect, it } from 'vitest';
import { aggregateProof, classifyProof, describeProofState, getQuorumKeySource, isProofFallbackBlocked, isProofVerificationError, type ProofState } from '../proofs';
import { CancelledError } from '@tanstack/react-query';
import { classifySdkError, isAbsentEntityError, isAllEndpointsFailure, isRetryableSdkError, normalizeError, shouldRetrySdkQuery } from '../errors';
import { nativeProofError, SDK_PROOF_CONTEXT_MESSAGE, SDK_PROOF_DECODE_MESSAGE } from '@/test/proof-errors';

describe('classifyProof', () => {
  it.each(['raw', 'normalized', 'wrapped'])('classifies the actual unsupported WASM context error as unavailable (%s)', (shape) => {
    const native = nativeProofError(SDK_PROOF_CONTEXT_MESSAGE);
    const error = shape === 'raw' ? native : shape === 'normalized' ? normalizeError(native) : new Error('Epoch read failed', { cause: native });
    expect(isProofVerificationError(error)).toBe(false);
    expect(isProofFallbackBlocked(error)).toBe(true);
    const state = classifyProof({ status: 'error', data: undefined, error: normalizeError(error), fetchStatus: 'idle', dataUpdatedAt: 0 }, { trusted: false, hasProofVariant: true });
    expect(state.kind).toBe('unavailable');
    expect(describeProofState(state)).toContain('proof verification was not completed');
  });

  it.each([
    new Error(SDK_PROOF_CONTEXT_MESSAGE, { cause: nativeProofError('invalid quorum signature') }),
    new Error('state root differs', { cause: nativeProofError(SDK_PROOF_CONTEXT_MESSAGE) }),
  ])('retains cryptographic mismatch priority through unsupported WASM context wrappers', (error) => {
    expect(isProofVerificationError(error)).toBe(true);
    expect(isProofFallbackBlocked(error)).toBe(true);
  });

  it.each(['raw', 'normalized', 'wrapped'])('classifies the live SDK decoder error as unavailable (%s)', (shape) => {
    const native = nativeProofError();
    const error = shape === 'raw' ? native : shape === 'normalized' ? normalizeError(native) : new Error('Proof request failed', { cause: native });
    expect(isProofVerificationError(error)).toBe(false);
    expect(isProofFallbackBlocked(error)).toBe(true);
    const state = classifyProof({ status: 'error', data: undefined, error: normalizeError(error), fetchStatus: 'idle', dataUpdatedAt: 0 }, { trusted: true, hasProofVariant: true });
    expect(state.kind).toBe('unavailable');
    expect(describeProofState(state)).toContain('proof verification was not completed');
    expect(normalizeError(native).message).toBe(`Proof [-1]: ${SDK_PROOF_DECODE_MESSAGE}`);
  });

  it('does not describe unavailable proof context or unsupported versions as cryptographic failures', () => {
    expect(isProofVerificationError(nativeProofError('unsupported proof version: 2'))).toBe(false);
    expect(isProofVerificationError(nativeProofError('quorum public key unavailable'))).toBe(false);
  });

  it.each([
    ['quorum signature mismatch', true],
    ['state root differs', true],
    ['unrecognized native proof failure', true],
    ['proof verification failed: unable to decode proof', false],
  ])('keeps fallback blocked for native errors: %s', (message, failed) => {
    const error = new Error('Request failed', { cause: nativeProofError(message) });
    expect(isProofVerificationError(error)).toBe(failed);
    expect(isProofFallbackBlocked(error)).toBe(true);
  });

  it('retains explicit crypto mismatches through unavailable wrappers and string causes', () => {
    expect(isProofVerificationError(new Error('quorum public key unavailable', { cause: nativeProofError('invalid quorum signature') }))).toBe(true);
    const wrappedString = new Error('Request failed', { cause: 'invalid proof' });
    expect(isProofVerificationError(wrappedString)).toBe(true);
    expect(isProofFallbackBlocked(wrappedString)).toBe(true);
    expect(isProofFallbackBlocked(new Error('network offline'))).toBe(false);
    expect(isProofVerificationError(new Error('network offline'))).toBe(false);
  });

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
    expect(r).toEqual({ kind: 'unavailable', error: 'x', reason: 'unknown' });
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
    expect(isProofVerificationError({ kind: 4, name: 'Proof', message: 'State root differs' })).toBe(true);
    expect(isProofVerificationError({ kind: 5, name: 'InvalidProvedResponse' })).toBe(true);
    expect(isProofVerificationError({ kind: 18, name: 'ContextProviderError', message: 'quorum key unavailable' })).toBe(false);
    expect(isProofVerificationError({ kind: 6, name: 'DapiClientError', message: 'network failure' })).toBe(false);
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

/** Getter-shaped WasmSdkError like the pinned rc.2 runtime produces. */
function sdkError(kind: number, name: string, message: string): unknown {
  return Object.create({
    get kind() { return kind; },
    get name() { return name; },
    get code() { return -1; },
    get message() { return message; },
  }, { __wbg_ptr: { value: 1, enumerable: true } });
}

describe('SDK error kinds', () => {
  const unavailable = (error: unknown) => classifyProof(
    { status: 'error', data: undefined, error: normalizeError(error), fetchStatus: 'idle', dataUpdatedAt: 0 },
    { trusted: true, hasProofVariant: true },
  );

  it.each([
    [27, 'NotFound', 'Data contract not found'],
    [13, 'EpochNotFound', 'epoch not found'],
    [12, 'TotalCreditsNotFound', 'total credits not found'],
    [23, 'IdentityNonceNotFound', 'identity nonce not found'],
  ])('classifies %s %s as not-found, never as a proof failure', (kind, name, message) => {
    const error = sdkError(kind, name, message);
    expect(classifySdkError(error)).toBe('not-found');
    expect(isProofVerificationError(error)).toBe(false);
    expect(isProofFallbackBlocked(error)).toBe(true);
    expect(isRetryableSdkError(error)).toBe(false);
    expect(unavailable(error)).toMatchObject({ kind: 'unavailable', reason: 'not-found' });
  });

  it.each([
    [14, 'TimeoutReached', 'request timed out', 'timeout'],
    // Live rc.2 responses: an old node and an exhausted address list.
    [6, 'DapiClientError', "transport error: grpc error: code: 'Operation is not implemented or not supported'", 'transport'],
    [17, 'Generic', "Failed to get status: no available addresses to retry, last error: grpc error: code: 'Internal error', message: \"Failed to call gRPC service: JS API error: TypeError: fetch failed\"", 'transport'],
  ] as const)('classifies %s %s as a retryable outage', (kind, name, message, expected) => {
    const error = sdkError(kind, name, message);
    expect(classifySdkError(error)).toBe(expected);
    expect(isProofVerificationError(error)).toBe(false);
    expect(isProofFallbackBlocked(error)).toBe(false);
    expect(isRetryableSdkError(error)).toBe(true);
    const state = unavailable(error);
    expect(state).toMatchObject({ kind: 'unavailable', reason: expected });
    expect(describeProofState(state)).toMatch(/Retry may succeed/);
  });

  it.each([
    [18, 'ContextProviderError', 'Quorum not found in cache for hash 0000004c…'],
    [4, 'Proof', 'context provider error: Failed to find quorum 0000004c…'],
  ])('labels a missing quorum (%s %s) unavailable, not failed, and does not fall back', (kind, name, message) => {
    const error = new Error('Request failed', { cause: sdkError(kind, name, message) });
    expect(classifySdkError(error)).toBe('missing-quorum');
    expect(isProofVerificationError(error)).toBe(false);
    expect(isProofFallbackBlocked(error)).toBe(true);
    expect(isRetryableSdkError(error)).toBe(false);
    const state = unavailable(error);
    expect(state).toMatchObject({ kind: 'unavailable', reason: 'missing-quorum' });
    expect(describeProofState(state)).toMatch(/not a failed proof/);
  });

  it('keeps cryptographic mismatches as verification failures and never retries them', () => {
    const error = sdkError(4, 'Proof', 'invalid quorum signature');
    expect(classifySdkError(error)).toBe('verification');
    expect(isRetryableSdkError(error)).toBe(false);
    expect(unavailable(error).kind).toBe('failed');
  });

  it('does not retry rejected requests or cancelled sessions, retries unknown errors once', () => {
    expect(shouldRetrySdkQuery(0, sdkError(25, 'InvalidArgument', 'bad id'))).toBe(false);
    expect(shouldRetrySdkQuery(0, new CancelledError())).toBe(false);
    expect(shouldRetrySdkQuery(0, new Error('offline'))).toBe(true);
    expect(shouldRetrySdkQuery(1, new Error('offline'))).toBe(false);
  });

  it('detects an exhausted DAPI address list through wrappers', () => {
    expect(isAllEndpointsFailure(new Error('x', { cause: sdkError(17, 'Generic', 'no available addresses to retry') }))).toBe(true);
    expect(isAllEndpointsFailure(sdkError(6, 'DapiClientError', 'transport error'))).toBe(false);
  });
});

describe('absence and kind provenance', () => {
  it('treats only entity-specific absences as a definite empty answer', () => {
    expect(isAbsentEntityError(sdkError(12, 'TotalCreditsNotFound', 'total credits not found'))).toBe(true);
    expect(isAbsentEntityError(new Error('x', { cause: sdkError(13, 'EpochNotFound', 'epoch not found') }))).toBe(true);
    // Live rc.2: a documents query against a missing contract. The contract is
    // a dependency, so "no documents" would be the wrong answer.
    expect(isAbsentEntityError(sdkError(27, 'NotFound', 'Data contract not found'))).toBe(false);
  });

  // Queries throw normalizeError(raw): a plain Error whose message repeats the
  // raw text, with the tagged WasmSdkError on `cause`. Classify both shapes.
  it.each([
    [6, 'DapiClientError', "transport error: grpc error: code: 'Some requested entity was not found'"],
    [6, 'DapiClientError', "no available addresses to retry, last error: grpc error: code: 'Some requested entity was not found', message: \"identity 4EfA not found\""],
    // Live rc.2 unproved identity fetch for an unknown ID: one node's answer.
    [17, 'Generic', 'Failed to fetch identity: transport error: grpc error: code: \'Some requested entity was not found\', message: "identity 4EfA not found"'],
  ])('does not treat a gRPC NOT_FOUND (%s %s) as proven absence, raw or normalized', (kind, name, message) => {
    const raw = sdkError(kind, name, message);
    const normalized = normalizeError(raw);
    expect(normalized).not.toBe(raw);
    for (const error of [raw, normalized, new Error('Identity read failed', { cause: normalized })]) {
      expect(classifySdkError(error)).toBe('transport');
      expect(isAbsentEntityError(error)).toBe(false);
      expect(isProofFallbackBlocked(error)).toBe(false);
      expect(shouldRetrySdkQuery(0, error)).toBe(true);
    }
    expect(classifySdkError('Some requested entity was not found')).toBe('transport');
  });

  it('keeps structured absences definite after normalization', () => {
    for (const raw of [sdkError(13, 'EpochNotFound', 'epoch not found'), sdkError(27, 'NotFound', 'Data contract not found')]) {
      expect(classifySdkError(normalizeError(raw))).toBe('not-found');
      expect(shouldRetrySdkQuery(0, normalizeError(raw))).toBe(false);
    }
    expect(isAbsentEntityError(normalizeError(sdkError(13, 'EpochNotFound', 'epoch not found')))).toBe(true);
  });

  it('ignores numeric kinds from other enums (WasmDppError) when the name disagrees', () => {
    expect(classifySdkError(sdkError(2, 'Serialization', 'cannot deserialize document'))).toBe('unknown');
    expect(classifySdkError(sdkError(4, 'Generic', 'dpp failure'))).toBe('unknown');
    expect(classifySdkError(sdkError(0, 'Protocol', 'protocol error'))).toBe('unknown');
  });
});
