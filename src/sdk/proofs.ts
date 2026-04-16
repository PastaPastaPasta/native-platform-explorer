import type { UseQueryResult } from '@tanstack/react-query';

export type ProofState =
  | { kind: 'verified'; verifiedAt: number }
  | { kind: 'unverified-in-flight' }
  | { kind: 'unverified-no-variant'; reason: 'no-proof-method' }
  | { kind: 'unverified-trusted-off'; reason: 'trusted-mode-off' }
  | { kind: 'failed'; error: string }
  | { kind: 'unknown' };

export interface ClassifyOptions {
  trusted: boolean;
  /** True when the underlying SDK method has a `…WithProof` sibling. */
  hasProofVariant: boolean;
}

/**
 * Derive a ProofState from a React Query result plus hook metadata.
 * This is a best-effort classifier — we don't yet introspect the WASM SDK's
 * own proof struct, so "verified" here means "the query returned successfully
 * through a trusted-mode connect()". Stage 5 commits the honest-labeling UI,
 * Stage 6 can tighten the binding.
 */
export function classifyProof<TData>(
  query: Pick<UseQueryResult<TData, Error>, 'status' | 'data' | 'error' | 'fetchStatus'>,
  opts: ClassifyOptions,
): ProofState {
  if (!opts.hasProofVariant) {
    return { kind: 'unverified-no-variant', reason: 'no-proof-method' };
  }
  if (!opts.trusted) {
    return { kind: 'unverified-trusted-off', reason: 'trusted-mode-off' };
  }
  if (query.status === 'error') {
    return { kind: 'failed', error: query.error?.message ?? 'Unknown error' };
  }
  if (query.status === 'pending' || query.fetchStatus === 'fetching') {
    return { kind: 'unverified-in-flight' };
  }
  if (query.status === 'success' && query.data !== undefined) {
    return { kind: 'verified', verifiedAt: Date.now() };
  }
  return { kind: 'unknown' };
}

const SEVERITY: Record<ProofState['kind'], number> = {
  failed: 50,
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
      return 'Proof verified in your browser.';
    case 'unverified-in-flight':
      return 'Fetching — proof verification pending.';
    case 'unverified-no-variant':
      return 'This SDK method does not return a proof on testnet/mainnet.';
    case 'unverified-trusted-off':
      return 'Trusted mode is off. Data fetched without proof verification.';
    case 'failed':
      return `Proof verification failed: ${s.error}`;
    case 'unknown':
    default:
      return 'Proof state unknown.';
  }
}
