import type { UseQueryResult } from '@tanstack/react-query';
import { devnetShortName, getNetwork } from './networks';

export type ProofState =
  | { kind: 'verified'; verifiedAt: number }
  | { kind: 'unverified-in-flight' }
  | { kind: 'unverified-no-variant'; reason: 'no-proof-method' }
  | { kind: 'unverified-trusted-off'; reason: 'trusted-mode-off' }
  | { kind: 'failed'; error: string }
  | { kind: 'unavailable'; error: string }
  | { kind: 'unknown' };

export interface ClassifyOptions {
  trusted: boolean;
  /** True when the underlying SDK method has a `…WithProof` sibling. */
  hasProofVariant: boolean;
}

type ProofError = { code?: unknown; kind?: unknown; name?: unknown; message?: unknown; cause?: unknown };

const PROOF_ERROR_TAG = /^(ProofVerificationFailed|InvalidProof|InvalidSignature|PROOF_VERIFICATION_FAILED|DriveProofError|Proof|InvalidProvedResponse)$/;
const VERIFICATION_FAILURE = /\b(?:proof verification (?:failed|error)|invalid (?:grovedb |merkle )?proof|invalid quorum signature)\b/i;
const CRYPTOGRAPHIC_MISMATCH = /\b(?:invalid (?:quorum )?signature|(?:quorum )?signature (?:verification )?(?:failed|mismatch)|(?:state |merkle )?root (?:hash )?(?:mismatch|differs))\b/i;
const PROOF_UNAVAILABLE = /\b(?:(?:unable|failed|cannot) to (?:decode|parse) (?:the )?(?:grovedb )?proof|unsupported (?:proof|protocol) version|non-trusted mode is not supported in wasm|(?:missing|unavailable) (?:proof context|quorum (?:public )?key)|(?:proof context|quorum (?:public )?key) (?:is )?(?:missing|unavailable)|failed to (?:retrieve|fetch) quorum (?:public )?key)\b/i;

/** SDK fields live on prototype getters; normalization preserves the raw error
 * on cause. Traverse both without enumerating or importing the WASM runtime. */
function* proofErrorChain(error: unknown): Generator<ProofError> {
  const seen = new Set<object>();
  let current = error;
  while (current) {
    if (typeof current === 'string') { yield { message: current }; return; }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    const e = current as ProofError;
    yield e;
    current = e.cause;
  }
}

function isNativeProofError(e: ProofError): boolean {
  // Pinned rc.2 WasmSdkErrorKind: DriveProofError=2, Proof=4,
  // InvalidProvedResponse=5. These categories include decoding failures.
  return [e.code, e.kind, e.name].some((tag) => PROOF_ERROR_TAG.test(String(tag ?? '')))
    || (typeof e.kind === 'number' && [2, 4, 5].includes(e.kind));
}

/** A native proof error must never trigger an ordinary-method retry, even when
 * decoding/context limitations prevent a cryptographic-failure diagnosis. */
export function isProofFallbackBlocked(error: unknown): boolean {
  for (const e of proofErrorChain(error)) {
    if (isNativeProofError(e)) return true;
    if (typeof e.message === 'string' && (VERIFICATION_FAILURE.test(e.message) || CRYPTOGRAPHIC_MISMATCH.test(e.message) || PROOF_UNAVAILABLE.test(e.message))) return true;
  }
  return false;
}

/** Recognized decoding/context limitations are unavailable. Explicit crypto
 * mismatches and otherwise unknown native proof errors remain failures. */
export function isProofVerificationError(error: unknown): boolean {
  let proofFailure = false;
  let unavailable = false;
  for (const e of proofErrorChain(error)) {
    proofFailure ||= isNativeProofError(e);
    if (typeof e.message !== 'string') continue;
    if (CRYPTOGRAPHIC_MISMATCH.test(e.message)) return true;
    unavailable ||= PROOF_UNAVAILABLE.test(e.message);
    proofFailure ||= VERIFICATION_FAILURE.test(e.message);
  }
  return proofFailure && !unavailable;
}

export type VerificationResult = 'verified' | 'not-verified' | 'failed' | 'unavailable';

export function verificationForResponse(opts: ClassifyOptions & {
  status: 'success' | 'error';
  error?: unknown;
}): VerificationResult {
  if (opts.status === 'error') {
    return isProofVerificationError(opts.error) ? 'failed' : 'unavailable';
  }
  return opts.trusted && opts.hasProofVariant ? 'verified' : 'not-verified';
}

/** The configured trust anchor, not a claim that the browser validates Core consensus. */
export function getQuorumKeySource(network: string, trusted: boolean): string {
  if (!trusted) return 'Not used (trusted mode off)';
  const cfg = getNetwork(network);
  return cfg.quorumUrl ?? `https://quorums.${cfg.type === 'devnet' ? devnetShortName(cfg) : cfg.type}.networks.dash.org`;
}

/** Ordinary trusted SDK methods verify internally; captured bytes are independent.
 * dataUpdatedAt belongs to the cached response, so renders never renew verification. */
export function classifyProof<TData>(
  query: Pick<UseQueryResult<TData, Error>, 'status' | 'data' | 'error' | 'fetchStatus' | 'dataUpdatedAt'>,
  opts: ClassifyOptions,
): ProofState {
  if (query.status === 'error') {
    return {
      kind: isProofVerificationError(query.error) ? 'failed' : 'unavailable',
      error: query.error?.message ?? 'Unknown error',
    };
  }
  if (!opts.hasProofVariant) {
    return { kind: 'unverified-no-variant', reason: 'no-proof-method' };
  }
  if (!opts.trusted) {
    return { kind: 'unverified-trusted-off', reason: 'trusted-mode-off' };
  }
  if (query.status === 'success' && query.data !== undefined) {
    return { kind: 'verified', verifiedAt: query.dataUpdatedAt };
  }
  if (query.status === 'pending') {
    return { kind: 'unverified-in-flight' };
  }
  return { kind: 'unknown' };
}

const SEVERITY: Record<ProofState['kind'], number> = {
  failed: 50,
  unavailable: 40,
  'unverified-in-flight': 30,
  'unverified-trusted-off': 20,
  'unverified-no-variant': 10,
  unknown: 5,
  verified: 0,
};

/** Reduce many query proof states into a single page-level state. Worst wins. */
export function aggregateProof(states: ProofState[]): ProofState {
  if (states.length === 0) return { kind: 'unknown' };
  let worst: ProofState = states[0]!;
  for (const s of states.slice(1)) {
    if (SEVERITY[s.kind] > SEVERITY[worst.kind]) worst = s;
  }
  return worst;
}

/** Humanised explanation for tooltips + banners. */
export function describeProofState(s: ProofState): string {
  switch (s.kind) {
    case 'verified':
      return 'The SDK verified this response in your browser using trusted quorum keys. Captured proof bytes are optional.';
    case 'unverified-in-flight':
      return 'Fetching — proof verification pending.';
    case 'unverified-no-variant':
      return 'This SDK method does not support proof verification.';
    case 'unverified-trusted-off':
      return 'Trusted mode is off. Data fetched without proof verification.';
    case 'failed':
      return `Proof verification failed: ${s.error}`;
    case 'unavailable':
      return `Query unavailable; proof verification was not completed: ${s.error}`;
    case 'unknown':
    default:
      return 'Proof state unknown.';
  }
}
