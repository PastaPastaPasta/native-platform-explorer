import type { QueryProofEntry } from '@/contexts/QueryProofStore';
import { EVO_SDK_VERSION } from '@/version';
import { safeStringify } from '@util/wasm-json';

export const EVIDENCE_TRUST_NOTICE =
  'For verified responses, verification is performed by the SDK in this browser against quorum public keys from the configured trusted service. ' +
  'The browser trusts that service for the quorum keys; it does not independently validate Dash Core consensus. ' +
  'An exported JSON file records the observed response and verification outcome. It is not signed or independently verified, ' +
  'and does not establish that the response is still current. Ordinary trusted SDK methods can verify without exposing proof bytes.';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createEvidenceBundle(entries: readonly QueryProofEntry[], exportedAt = Date.now()) {
  return {
    format: 'native-platform-explorer/query-evidence',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    sdk: { package: '@dashevo/evo-sdk', version: EVO_SDK_VERSION },
    serialization: { binary: 'hex', bigint: 'decimal string' },
    trustNotice: EVIDENCE_TRUST_NOTICE,
    queries: entries.map((entry) => ({
      query: { key: entry.queryKey, method: entry.methodName, params: entry.methodParams },
      context: {
        network: entry.network ?? 'unknown',
        trustedMode: entry.trusted ?? null,
        quorumKeySource: entry.quorumKeySource ?? 'not recorded',
      },
      retrieval: {
        receivedAt: new Date(entry.timestamp).toISOString(),
        ageAtExportMs: Math.max(0, exportedAt - entry.timestamp),
        durationMs: entry.durationMs,
        status: entry.status,
        error: entry.status === 'error' ? entry.error : undefined,
      },
      verification: {
        outcome: entry.verification ?? 'unknown',
        proofAvailability: entry.proof ? 'captured' : entry.omitted?.proof ? 'omitted-storage-limit' : 'not-captured',
        captureError: entry.proofCaptureError,
      },
      result: entry.result,
      metadata: entry.metadata,
      omitted: entry.omitted,
      proof: entry.proof ? {
        grovedbProof: bytesToHex(entry.proof.grovedbProof),
        quorumHash: bytesToHex(entry.proof.quorumHash),
        signature: bytesToHex(entry.proof.signature),
        blockIdHash: bytesToHex(entry.proof.blockIdHash),
        round: entry.proof.round,
        quorumType: entry.proof.quorumType,
      } : undefined,
    })),
  };
}

export function serializeEvidenceBundle(entries: readonly QueryProofEntry[], exportedAt?: number): string {
  return safeStringify(createEvidenceBundle(entries, exportedAt));
}

export function downloadEvidenceBundle(entries: readonly QueryProofEntry[]): void {
  const url = URL.createObjectURL(new Blob([serializeEvidenceBundle(entries)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'platform-query-evidence-v1.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
