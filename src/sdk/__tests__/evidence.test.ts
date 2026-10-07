import { describe, expect, it } from 'vitest';
import { createEvidenceBundle, serializeEvidenceBundle } from '../evidence';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';

const entry: QueryProofEntry = {
  queryKey: ['npe', 'testnet', true, 'session-1', 'identity'], methodName: 'identities.fetch', methodParams: { id: 'identity' },
  hasProofVariant: true, timestamp: 1000, durationMs: 12, status: 'success', network: 'testnet', trusted: true,
  verification: 'verified', quorumKeySource: 'https://quorums.testnet.networks.dash.org',
  result: { balance: 9007199254740993n }, metadata: { height: 123, epoch: 2, coreChainLockedHeight: 45, timeMs: 900, protocolVersion: 1, chainId: 'evo1' },
};

describe('evidence bundle', () => {
  it('exports the original query, timestamp, trust context, response height, and lossless integer strings', () => {
    const bundle = JSON.parse(serializeEvidenceBundle([entry], 5000));
    expect(bundle).toMatchObject({ version: 1, sdk: { package: '@dashevo/evo-sdk' }, serialization: { binary: 'hex', bigint: 'decimal string' } });
    expect(bundle.queries[0]).toMatchObject({
      context: { network: 'testnet', trustedMode: true, quorumKeySource: entry.quorumKeySource },
      query: { method: 'identities.fetch', params: { id: 'identity' } },
      retrieval: { receivedAt: '1970-01-01T00:00:01.000Z', ageAtExportMs: 4000 },
      verification: { outcome: 'verified', proofAvailability: 'not-captured' },
      result: { balance: '9007199254740993' }, metadata: { height: 123 },
    });
    expect(bundle.trustNotice).toContain('trusts that service');
    expect(bundle.trustNotice).toContain('not signed or independently verified');
  });

  it('encodes captured proof bytes explicitly as hex without implying file verification', () => {
    const bundle = createEvidenceBundle([{ ...entry, proof: { grovedbProof: new Uint8Array([0, 255]), quorumHash: new Uint8Array([1]), signature: new Uint8Array([2]), blockIdHash: new Uint8Array([3]), round: 4, quorumType: 106 } }], 5000);
    expect(bundle.queries[0]!.proof).toMatchObject({ grovedbProof: '00ff', quorumHash: '01', signature: '02', blockIdHash: '03' });
    expect(bundle.queries[0]!.verification.proofAvailability).toBe('captured');
  });

  it('distinguishes capture unavailable, query unavailable, and storage omissions', () => {
    const bundle = createEvidenceBundle([
      { ...entry, proofCaptureError: 'capture unavailable' },
      { ...entry, status: 'error', verification: 'unavailable', error: 'offline' },
      { ...entry, omitted: { result: true, proof: true, reason: 'storage-limit' } },
    ], 5000);
    expect(bundle.queries[0]!.verification).toMatchObject({ outcome: 'verified', captureError: 'capture unavailable' });
    expect(bundle.queries[1]!.retrieval.error).toBe('offline');
    expect(bundle.queries[1]!.verification.outcome).toBe('unavailable');
    expect(bundle.queries[2]!.verification.proofAvailability).toBe('omitted-storage-limit');
  });
});
