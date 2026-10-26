import type { UseQueryResult } from '@tanstack/react-query';
import { devnetShortName, getNetwork } from './networks';
import { classifySdkError, type SdkErrorClass } from './errors';

export type ProofState =
  | { kind: 'verified'; verifiedAt: number }
  | { kind: 'unverified-in-flight' }
  | { kind: 'unverified-no-variant'; reason: 'no-proof-method' }
  | { kind: 'failed'; error: string }
  | { kind: 'unavailable'; error: string; reason?: UnavailableReason }
  | { kind: 'unknown' };

/** Why a query produced no verifiable answer. */
export type UnavailableReason = Exclude<SdkErrorClass, 'verification'>;

/** Every session is trusted: the pinned SDK cannot query without its
 * trusted context, so there is no unverified "trusted mode off" state. */
export interface ClassifyOptions {
  /** True when the underlying SDK method has a `…WithProof` sibling. */
  hasProofVariant: boolean;
}

/** Native proof, missing-quorum, absence and decoding/context errors must never
 * trigger an ordinary-method retry: the ordinary method uses the same trusted
 * context and would hit the same condition (or silently mask it). */
export function isProofFallbackBlocked(error: unknown): boolean {
  const kind = classifySdkError(error);
  return kind === 'verification' || kind === 'proof-unavailable' || kind === 'missing-quorum' || kind === 'not-found';
}

/** Recognized decoding/context limitations and missing quorum keys are
 * unavailable. Explicit crypto mismatches and otherwise unknown native proof
 * errors remain failures. */
export function isProofVerificationError(error: unknown): boolean {
  return classifySdkError(error) === 'verification';
}

export type VerificationResult = 'verified' | 'not-verified' | 'failed' | 'unavailable';

export function verificationForResponse(opts: ClassifyOptions & {
  /** The session's trust flag, recorded in evidence; always true in the app. */
  trusted: boolean;
  status: 'success' | 'error';
  error?: unknown;
}): VerificationResult {
  if (opts.status === 'error') {
    return isProofVerificationError(opts.error) ? 'failed' : 'unavailable';
  }
  return opts.trusted && opts.hasProofVariant ? 'verified' : 'not-verified';
}

/** The configured trust anchor, not a claim that the browser validates Core consensus. */
export function getQuorumKeySource(network: string, quorumUrlOverride?: string | null): string {
  const cfg = getNetwork(network);
  return quorumUrlOverride || cfg.quorumUrl || `https://quorums.${cfg.type === 'devnet' ? devnetShortName(cfg) : cfg.type}.networks.dash.org`;
}

/** Ordinary trusted SDK methods verify internally; captured bytes are independent.
 * dataUpdatedAt belongs to the cached response, so renders never renew verification. */
export function classifyProof<TData>(
  query: Pick<UseQueryResult<TData, Error>, 'status' | 'data' | 'error' | 'fetchStatus' | 'dataUpdatedAt'>,
  opts: ClassifyOptions,
): ProofState {
  if (query.status === 'error') {
    const error = query.error?.message ?? 'Unknown error';
    const kind = classifySdkError(query.error);
    return kind === 'verification' ? { kind: 'failed', error } : { kind: 'unavailable', error, reason: kind };
  }
  if (!opts.hasProofVariant) {
    return { kind: 'unverified-no-variant', reason: 'no-proof-method' };
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
    case 'failed':
      return `Proof verification failed: ${s.error}`;
    case 'unavailable':
      switch (s.reason) {
        case 'timeout':
          return `Platform did not answer in time; nothing was verified. Retry may succeed: ${s.error}`;
        case 'transport':
          return `Could not reach a Platform node; nothing was verified. Retry may succeed: ${s.error}`;
        case 'missing-quorum':
          return `This response names a quorum that is not in the trusted quorum list, so its proof could not be checked. The list may predate a quorum rotation; Reconnect fetches a fresh one: ${s.error}`;
        case 'not-found':
          return `Platform reported no matching record: ${s.error}`;
        default:
          return `Query unavailable; proof verification was not completed: ${s.error}`;
      }
    case 'unknown':
    default:
      return 'Proof state unknown.';
  }
}
