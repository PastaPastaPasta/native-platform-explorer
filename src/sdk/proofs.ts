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

/** Only explicit SDK verification failures warrant a cryptographic-failure label.
 * Transport, parsing, missing context, and unavailable quorum-key errors do not. */
export function isProofVerificationError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const e = current as { code?: unknown; kind?: unknown; message?: unknown; cause?: unknown };
    const explicitFailure = /^(ProofVerificationFailed|InvalidProof|InvalidSignature|PROOF_VERIFICATION_FAILED)$/;
    if (explicitFailure.test(String(e.code ?? '')) || explicitFailure.test(String(e.kind ?? ''))) return true;
    if (typeof e.message === 'string' &&
        /\b(?:proof verification failed|invalid (?:grovedb|merkle) proof|invalid quorum signature)\b/i.test(e.message)) return true;
    current = e.cause;
  }
  return false;
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
