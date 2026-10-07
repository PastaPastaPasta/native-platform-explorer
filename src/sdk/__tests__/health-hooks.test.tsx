import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { QueryProofStoreProvider } from '@/contexts/QueryProofStore';
import { createTestQueryClient } from '@/test/render';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { SdkContext } from '../SdkProvider';
import { invalidateNetworkQueries } from '../hooks';
import { useNetworkHealth } from '../health';
import { fetchCoreStatus } from '@/util/insight';

vi.mock('@/util/insight', () => ({ fetchCoreStatus: vi.fn().mockResolvedValue({ blocks: 100, fetchedAt: 0, blockTimeMs: null }) }));

function Probe() {
  const health = useNetworkHealth();
  return <div data-testid="health">{health.level}:{health.platformHeight ?? ''}:{health.reasons.join(',')}</div>;
}

describe('health snapshot availability', () => {
  it('reports unknown when a refresh fails instead of comparing current Core with an old Platform snapshot', async () => {
    const now = Date.now();
    const status = vi.fn().mockResolvedValueOnce({
      chain: { latestBlockHeight: 8, coreChainLockedHeight: 100 },
      time: { block: now, local: now },
    }).mockRejectedValue(new Error('node unavailable'));
    const context = createSdkContextValue({ sdk: createMockSdk({ system: { status } }) });
    const client = createTestQueryClient();
    render(<QueryClientProvider client={client}><SdkContext.Provider value={context}><QueryProofStoreProvider><Probe /></QueryProofStoreProvider></SdkContext.Provider></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId('health')).toHaveTextContent('healthy:8'));
    await act(async () => { await invalidateNetworkQueries(client, context.network); });
    await waitFor(() => expect(screen.getByTestId('health')).toHaveTextContent('unknown::Platform status is currently unavailable'));
    client.clear();
  });

  it('does not fetch fallback-network Core data while the SDK is blocked', async () => {
    vi.mocked(fetchCoreStatus).mockClear();
    const context = createSdkContextValue({ sdk: null, status: 'error' });
    const client = createTestQueryClient();
    render(<QueryClientProvider client={client}><SdkContext.Provider value={context}><QueryProofStoreProvider><Probe /></QueryProofStoreProvider></SdkContext.Provider></QueryClientProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(fetchCoreStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('health')).toHaveTextContent('unknown:');
    client.clear();
  });
});
