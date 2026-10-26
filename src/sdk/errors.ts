import { isCancelledError } from '@tanstack/react-query';
import { walkInstance, safeStringify } from '@util/wasm-json';

/**
 * Pull a human-readable message out of an SDK error. The WASM SDK throws
 * objects like WasmSdkError / ConsensusError / WasmDppError that are NOT
 * Error instances and whose state (message, code, kind, name) lives behind
 * prototype getters. `String(err)` on them returns "[object Object]", which
 * is why the Query Inspector used to show that for failures. `walkInstance`
 * reads the getters; we then format the most useful fields into one line.
 */
export function extractErrorMessage(err: unknown): string {
  if (err === null || err === undefined) return String(err);
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err !== 'object') return String(err);
  try {
    const walked = walkInstance(err) as Record<string, unknown>;
    const ctorName = (err as { constructor?: { name?: string } }).constructor?.name;
    const name = typeof walked.name === 'string' ? walked.name : undefined;
    const kind = typeof walked.kind === 'string' ? walked.kind : undefined;
    const code =
      walked.code !== undefined && walked.code !== null ? String(walked.code) : undefined;
    const message = typeof walked.message === 'string' ? walked.message : undefined;

    const label = name ?? (ctorName && ctorName !== 'Object' ? ctorName : undefined);
    const tagParts: string[] = [];
    if (label) tagParts.push(label);
    if (kind && kind !== label) tagParts.push(`(${kind})`);
    if (code) tagParts.push(`[${code}]`);
    const tag = tagParts.join(' ');

    if (message) return tag ? `${tag}: ${message}` : message;
    const dump = safeStringify(walked, 0);
    if (dump && dump !== '{}') return tag ? `${tag}: ${dump}` : dump;
    if (tag) return tag;
  } catch {
    /* fall through */
  }
  return String(err);
}

/** Wrap a thrown value in a proper Error so React Query and consumers get
 *  a usable `.message`. Keeps the original on `.cause` for debugging. */
export function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  const wrapped = new Error(extractErrorMessage(err));
  (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}

type SdkErrorFields = { code?: unknown; kind?: unknown; name?: unknown; message?: unknown; cause?: unknown };

/** SDK fields live on prototype getters; normalization preserves the raw error
 * on cause. Traverse both without enumerating or importing the WASM runtime. */
export function* sdkErrorChain(error: unknown): Generator<SdkErrorFields> {
  const seen = new Set<object>();
  let current = error;
  while (current) {
    if (typeof current === 'string') { yield { message: current }; return; }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    const e = current as SdkErrorFields;
    yield e;
    current = e.cause;
  }
}

/**
 * Coarse outcome of a failed SDK call, used for empty states, retry policy and
 * proof labels:
 * - `not-found`: the SDK reported a definite absence (pinned rc.2 kinds
 *   TotalCreditsNotFound=12, EpochNotFound=13, IdentityNonceNotFound=23,
 *   NotFound=27, or a gRPC NOT_FOUND status).
 * - `timeout` / `transport`: no usable answer from DAPI; worth retrying.
 * - `missing-quorum`: the response was signed by a quorum the trusted context
 *   does not hold, so its proof could not be checked (not a failed check).
 * - `proof-unavailable`: the proof could not be decoded or no proof context
 *   exists. `verification`: the proof was checked and did not verify.
 * - `invalid-request`: the SDK rejected the request itself.
 */
export type SdkErrorClass =
  | 'not-found'
  | 'timeout'
  | 'transport'
  | 'missing-quorum'
  | 'proof-unavailable'
  | 'verification'
  | 'invalid-request'
  | 'unknown';

// Pinned rc.2 WasmSdkErrorKind values; names mirror the `name` getter.
const KIND = {
  config: 0, driveProof: 2, proof: 4, invalidProvedResponse: 5, dapiClient: 6, coreClient: 10,
  totalCreditsNotFound: 12, epochNotFound: 13, timeout: 14, cancelled: 19, staleNode: 20,
  identityNonceNotFound: 23, invalidArgument: 25, serialization: 26, notFound: 27, notImplemented: 28,
} as const;
const NOT_FOUND_KINDS = new Set<number>([KIND.totalCreditsNotFound, KIND.epochNotFound, KIND.identityNonceNotFound, KIND.notFound]);
const TIMEOUT_KINDS = new Set<number>([KIND.timeout]);
// Kinds naming the absent entity itself. Generic NotFound (27) is also raised
// for a missing dependency, e.g. "Data contract not found" for a documents query.
const ABSENT_ENTITY_KINDS = new Set<number>([KIND.totalCreditsNotFound, KIND.epochNotFound, KIND.identityNonceNotFound]);
const ABSENT_ENTITY_TAG = /^(EpochNotFound|TotalCreditsNotFound|IdentityNonceNotFound)$/;
const TRANSPORT_KINDS = new Set<number>([KIND.dapiClient, KIND.coreClient, KIND.cancelled, KIND.staleNode]);
const INVALID_KINDS = new Set<number>([KIND.config, KIND.invalidArgument, KIND.serialization, KIND.notImplemented]);
const PROOF_KINDS = new Set<number>([KIND.driveProof, KIND.proof, KIND.invalidProvedResponse]);

const NOT_FOUND_TAG = /^(NotFound|EpochNotFound|TotalCreditsNotFound|IdentityNonceNotFound)$/;
const TIMEOUT_TAG = /^(TimeoutReached)$/;
const TRANSPORT_TAG = /^(DapiClientError|CoreClientError|Cancelled|StaleNode)$/;
const INVALID_TAG = /^(Config|InvalidArgument|SerializationError|NotImplemented)$/;
const PROOF_TAG = /^(ProofVerificationFailed|InvalidProof|InvalidSignature|PROOF_VERIFICATION_FAILED|DriveProofError|Proof|InvalidProvedResponse)$/;

const VERIFICATION_FAILURE = /\b(?:proof verification (?:failed|error)|invalid (?:grovedb |merkle )?proof|invalid quorum signature)\b/i;
const CRYPTOGRAPHIC_MISMATCH = /\b(?:invalid (?:quorum )?signature|(?:quorum )?signature (?:verification )?(?:failed|mismatch)|(?:state |merkle )?root (?:hash )?(?:mismatch|differs))\b/i;
const PROOF_UNAVAILABLE = /\b(?:(?:unable|failed|cannot) to (?:decode|parse) (?:the )?(?:grovedb )?proof|unsupported (?:proof|protocol) version|non-trusted mode is not supported in wasm|(?:missing|unavailable) (?:proof context|quorum (?:public )?key)|(?:proof context|quorum (?:public )?key) (?:is )?(?:missing|unavailable)|failed to (?:retrieve|fetch) quorum (?:public )?key)\b/i;
const MISSING_QUORUM = /\b(?:quorum not found in cache|failed to find quorum|quorum (?:public key )?(?:for hash \S+ )?not found)\b/i;
const NOT_FOUND_MESSAGE = /\bsome requested entity was not found\b/i;
const TIMEOUT_MESSAGE = /\b(?:timed? ?out|timeout|deadline (?:has )?(?:exceeded|elapsed))\b/i;
const TRANSPORT_MESSAGE = /\b(?:no available addresses|transport error|fetch failed|failed to fetch|error sending request|network ?error|connection (?:refused|reset|closed)|service unavailable|operation is not implemented or not supported)\b/i;
const ALL_ENDPOINTS_FAILED = /\bno available addresses to retry\b/i;

/** Numeric kinds are WasmSdkErrorKind values only on SDK errors: WasmDppError
 * reuses 0–4 for unrelated kinds. When a `name` is present it must agree. */
function tagMatches(e: SdkErrorFields, kinds: ReadonlySet<number>, tag: RegExp): boolean {
  if ([e.code, e.kind, e.name].some((value) => typeof value === 'string' && tag.test(value))) return true;
  return typeof e.kind === 'number' && kinds.has(e.kind) && typeof e.name !== 'string';
}

/** Classify an SDK error by its structured kind and message across the cause
 * chain. Explicit cryptographic mismatches win over every other signal. */
export function classifySdkError(error: unknown): SdkErrorClass {
  const seen = new Set<SdkErrorClass>();
  let nativeProof = false;
  for (const e of sdkErrorChain(error)) {
    const message = typeof e.message === 'string' ? e.message : '';
    if (CRYPTOGRAPHIC_MISMATCH.test(message)) return 'verification';
    if (MISSING_QUORUM.test(message)) seen.add('missing-quorum');
    if (PROOF_UNAVAILABLE.test(message)) seen.add('proof-unavailable');
    if (VERIFICATION_FAILURE.test(message)) seen.add('verification');
    nativeProof ||= tagMatches(e, PROOF_KINDS, PROOF_TAG);
    const transport = tagMatches(e, TRANSPORT_KINDS, TRANSPORT_TAG);
    // A gRPC NOT_FOUND carried by a transport error is one node's unproven answer.
    if (tagMatches(e, NOT_FOUND_KINDS, NOT_FOUND_TAG) || (!transport && NOT_FOUND_MESSAGE.test(message))) seen.add('not-found');
    if (tagMatches(e, TIMEOUT_KINDS, TIMEOUT_TAG) || TIMEOUT_MESSAGE.test(message)) seen.add('timeout');
    if (transport || TRANSPORT_MESSAGE.test(message)) seen.add('transport');
    if (tagMatches(e, INVALID_KINDS, INVALID_TAG)) seen.add('invalid-request');
  }
  if (seen.has('missing-quorum')) return 'missing-quorum';
  if (seen.has('proof-unavailable')) return 'proof-unavailable';
  // Unrecognized native proof errors remain failures rather than outages.
  if (seen.has('verification') || nativeProof) return 'verification';
  for (const kind of ['not-found', 'timeout', 'transport', 'invalid-request'] as const) {
    if (seen.has(kind)) return kind;
  }
  return 'unknown';
}

/** The SDK proved the requested entity itself absent (total credits, epoch,
 * identity nonce), so the query's answer is "none" rather than an error. */
export function isAbsentEntityError(error: unknown): boolean {
  if (classifySdkError(error) !== 'not-found') return false;
  for (const e of sdkErrorChain(error)) {
    if (tagMatches(e, ABSENT_ENTITY_KINDS, ABSENT_ENTITY_TAG)) return true;
  }
  return false;
}

/** Every DAPI address failed or is banned: the network is unreachable from
 * this browser, not just one request. */
export function isAllEndpointsFailure(error: unknown): boolean {
  for (const e of sdkErrorChain(error)) {
    if (typeof e.message === 'string' && ALL_ENDPOINTS_FAILED.test(e.message)) return true;
  }
  return false;
}

/** Retry only outcomes another attempt can change. Definite answers (absent
 * records, failed verification, rejected requests) and missing quorum keys,
 * which the same session cannot acquire, are reported immediately. */
export function isRetryableSdkError(error: unknown): boolean {
  const kind = classifySdkError(error);
  return kind === 'timeout' || kind === 'transport' || kind === 'unknown';
}

/** React Query `retry`: one retry for outcomes another attempt can change. */
export function shouldRetrySdkQuery(failureCount: number, error: unknown): boolean {
  // Cancelled requests belong to a retired session; retrying cannot help.
  return failureCount < 1 && !isCancelledError(error) && isRetryableSdkError(error);
}

export type SdkSessionFailure = 'unknown-network' | 'timeout' | 'unreachable' | 'failed';

/** A failure of the SDK session itself rather than of one query. */
export class SdkSessionError extends Error {
  readonly reason: SdkSessionFailure;
  constructor(reason: SdkSessionFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SdkSessionError';
    this.reason = reason;
  }
}
