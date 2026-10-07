import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureInitialized, Identifier, type EvoSDK } from '@dashevo/evo-sdk';
import { QueryEntryDetail } from '@components/query-inspector/QueryEntryCard';
import { useQueryProofStore } from '@/contexts/QueryProofStore';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { nativeProofError, SDK_PROOF_CONTEXT_MESSAGE } from '@/test/proof-errors';
import { serializeEvidenceBundle } from '../evidence';
import { useCurrentEpoch } from '../queries';

type EpochQuery = NonNullable<Parameters<EvoSDK['epoch']['epochsInfo']>[0]>;
const DURATION = 788_400_000;
const NOW = 1 + 84 * DURATION + 1;
const BASE58_ID = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx';
const note = (trusted: boolean) => `Current epoch selected from separate ${trusted ? 'SDK-verified explicit queries and signed block time' : 'SDK calls and the local clock'}. No single proof payload or response height covers this selection.`;

function epoch(index: number) {
  return {
    index, firstBlockTime: BigInt(1 + index * DURATION), firstBlockHeight: 1n,
    firstCoreBlockHeight: 1, feeMultiplierPermille: 1000n, protocolVersion: 13,
  };
}

function envelope(index: number, selected = epoch(index)) {
  return {
    data: new Map([[index, selected]]),
    // The unsigned epoch disagrees deliberately. Neither it nor this one
    // response's proof/height may become aggregate provenance.
    metadata: { timeMs: NOW, epoch: 42, height: 123 },
    proof: { grovedbProof: new Uint8Array([1]), signature: new Uint8Array([2]) },
  };
}

function transports() {
  const epochsInfoWithProof = vi.fn((query: EpochQuery) => Promise.resolve(envelope(query.startEpoch!)));
  const epochsInfo = vi.fn((query: EpochQuery) => Promise.resolve(new Map([[query.startEpoch!, epoch(query.startEpoch!)]])));
  const sdk = createMockSdk({ epoch: { epochsInfoWithProof, epochsInfo } });
  return { sdk, epochsInfoWithProof, epochsInfo };
}

function Probe({ detail = false, expected }: { detail?: boolean; expected?: unknown }) {
  const query = useCurrentEpoch();
  const store = useQueryProofStore();
  return <>
    <div data-testid="state">{query.status}:{query.proofState.kind}</div>
    <div data-testid="selection">{query.data?.index}:{String(query.data === expected)}</div>
    <div data-testid="count">{store.entries.length}</div>
    <pre data-testid="bundle">{serializeEvidenceBundle(store.entries)}</pre>
    <button onClick={() => store.setEnabled(false)}>Disable capture</button>
    <button onClick={() => { void query.refetch(); }}>Refetch current</button>
    {detail && query.proofEntry ? <QueryEntryDetail entry={query.proofEntry} /> : null}
  </>;
}

function captured() {
  return JSON.parse(screen.getByTestId('bundle').textContent!).queries[0];
}

afterEach(() => { vi.restoreAllMocks(); });

describe('combined current-epoch evidence', () => {
  // Transport doubles establish hook/recording behavior only, not successful
  // cryptographic verification or live trusted-off WASM availability.
  it.each([true, false])('records both explicit reads with honest aggregate trust and provenance (trusted=%s)', async (trusted) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { sdk, epochsInfoWithProof, epochsInfo } = transports();
    renderWithProviders(<Probe />, { sdk: { sdk, network: 'mainnet', trusted } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent(`success:${trusted ? 'verified' : 'unverified-trusted-off'}`));
    const used = trusted ? epochsInfoWithProof : epochsInfo;
    expect(used.mock.calls.map(([query]) => query)).toEqual([
      { startEpoch: 0, count: 1, ascending: true },
      { startEpoch: 84, count: 1, ascending: true },
    ]);
    expect(trusted ? epochsInfo : epochsInfoWithProof).not.toHaveBeenCalled();
    expect(sdk.epoch.current).not.toHaveBeenCalled();
    expect(sdk.epoch.currentWithProof).not.toHaveBeenCalled();
    const evidence = captured();
    expect(evidence.context).toMatchObject({ network: 'mainnet', trustedMode: trusted });
    expect(evidence.verification).toMatchObject({
      outcome: trusted ? 'verified' : 'not-verified', proofAvailability: 'not-captured', captureNote: note(trusted),
    });
    expect(evidence.query.params).toMatchObject({ selection: 'genesis-and-time', network: 'mainnet' });
    expect(evidence.result).toMatchObject({ index: 84, firstBlockTime: String(1 + 84 * DURATION) });
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
    expect(evidence).not.toHaveProperty('resultCaptureError');
  });

  it.each([true, false])('exports native missing context as unavailable without retry or a success note (trusted=%s)', async (trusted) => {
    const { sdk, epochsInfoWithProof, epochsInfo } = transports();
    const used = trusted ? epochsInfoWithProof : epochsInfo;
    used.mockRejectedValue(nativeProofError(SDK_PROOF_CONTEXT_MESSAGE));
    renderWithProviders(<Probe />, { sdk: { sdk, network: 'mainnet', trusted } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:unavailable'));
    expect(used).toHaveBeenCalledOnce();
    expect(trusted ? epochsInfo : epochsInfoWithProof).not.toHaveBeenCalled();
    expect(sdk.epoch.current).not.toHaveBeenCalled();
    expect(sdk.epoch.currentWithProof).not.toHaveBeenCalled();
    const evidence = captured();
    expect(evidence.verification.outcome).toBe('unavailable');
    expect(evidence.retrieval.status).toBe('error');
    expect(evidence.verification).not.toHaveProperty('captureNote');
    expect(evidence).not.toHaveProperty('result');
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
  });

  it.each([
    new Error(SDK_PROOF_CONTEXT_MESSAGE, { cause: nativeProofError('invalid quorum signature') }),
    new Error('state root differs', { cause: nativeProofError(SDK_PROOF_CONTEXT_MESSAGE) }),
  ])('retains cryptographic mismatch precedence after a successful genesis read (%s)', async (error) => {
    const { sdk, epochsInfoWithProof, epochsInfo } = transports();
    epochsInfoWithProof.mockResolvedValueOnce(envelope(0)).mockRejectedValueOnce(error);
    renderWithProviders(<Probe />, { sdk: { sdk, network: 'mainnet' } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:failed'));
    expect(epochsInfoWithProof).toHaveBeenCalledTimes(2);
    expect(epochsInfo).not.toHaveBeenCalled();
    expect(sdk.epoch.current).not.toHaveBeenCalled();
    expect(sdk.epoch.currentWithProof).not.toHaveBeenCalled();
    const evidence = captured();
    expect(evidence.verification.outcome).toBe('failed');
    expect(evidence.verification).not.toHaveProperty('captureNote');
    expect(evidence).not.toHaveProperty('result');
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
  });

  it('still performs explicit proved reads when the inspector is disabled', async () => {
    const { sdk, epochsInfoWithProof, epochsInfo } = transports();
    renderWithProviders(<Probe />, { sdk: { sdk, network: 'mainnet' } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:verified'));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Disable capture' })));
    fireEvent.click(screen.getByRole('button', { name: 'Refetch current' }));
    await waitFor(() => expect(epochsInfoWithProof).toHaveBeenCalledTimes(4));
    expect(epochsInfoWithProof.mock.calls.map(([query]) => query.startEpoch)).toEqual([0, 84, 0, 84]);
    expect(epochsInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId('selection')).toHaveTextContent('84:');
    expect(screen.getByTestId('state')).toHaveTextContent('success:verified');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(JSON.parse(screen.getByTestId('bundle').textContent!).queries).toEqual([]);
  });
});

describe('native Identifier in selected aggregate snapshots', () => {
  beforeAll(async () => { await ensureInitialized(); });

  it('copies and exports the selected result with its native Base58 leaf and visible limitation', async () => {
    // Extra leaf is a serialization fixture, not a claim that live native
    // ExtendedEpochInfo has an Identifier field. The Identifier itself is real.
    const selected = { ...epoch(84), identifier: new Identifier(new Uint8Array(32).fill(7)) };
    const { sdk, epochsInfoWithProof, epochsInfo } = transports();
    epochsInfoWithProof.mockResolvedValueOnce(envelope(0)).mockResolvedValueOnce(envelope(84, selected));
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithProviders(<Probe detail expected={selected} />, { sdk: { sdk, network: 'mainnet' } });
    await waitFor(() => expect(screen.getByTestId('selection')).toHaveTextContent('84:true'));
    expect(screen.getByText(note(true))).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /^Result$/ }));
    expect(screen.getByText(note(true))).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copy displayed data' }));
    expect(write).toHaveBeenCalledOnce();
    const copied = JSON.parse(write.mock.calls[0]![0]);
    const evidence = captured();
    expect(copied).toMatchObject({ index: 84, identifier: BASE58_ID, firstBlockTime: String(1 + 84 * DURATION) });
    expect(evidence.result).toEqual(copied);
    expect(evidence.verification).toMatchObject({ outcome: 'verified', captureNote: note(true), proofAvailability: 'not-captured' });
    expect(evidence).not.toHaveProperty('proof');
    expect(evidence).not.toHaveProperty('metadata');
    expect(epochsInfoWithProof).toHaveBeenCalledTimes(2);
    expect(epochsInfo).not.toHaveBeenCalled();
  });
});
