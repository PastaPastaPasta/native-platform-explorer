import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SdkContext, type SdkContextValue } from '@sdk/SdkProvider';
import { QueryProofStoreProvider } from '@/contexts/QueryProofStore';
import { createMockSdk, createSdkContextValue } from '@/test/sdk';
import { createTestQueryClient } from '@/test/render';
import SearchPage from '../page';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ q: 'alice.dash' }) }));
vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
vi.mock('@components/search/GlobalSearchInput', () => ({ GlobalSearchInput: () => <input aria-label="Search" /> }));

describe('search with the actual SDK query wrapper', () => {
  it.each(['idle', 'connecting'] as const)('shows pending lookups while SDK status is %s', async (status) => {
    const queryClient = createTestQueryClient();
    const fetch = vi.fn().mockResolvedValue({ data: null });
    const sdk = createMockSdk({ dpns: { getUsernameByNameWithProof: fetch } });
    const pending = createSdkContextValue({ sdk: null, status });
    const content = (context: SdkContextValue) => (
      <QueryClientProvider client={queryClient}>
        <SdkContext.Provider value={context}>
          <QueryProofStoreProvider><SearchPage /></QueryProofStoreProvider>
        </SdkContext.Provider>
      </QueryClientProvider>
    );
    const view = render(content(pending));
    try {
      await act(async () => { await Promise.resolve(); });
      expect(fetch).not.toHaveBeenCalled();
      expect(view.container.querySelector('.loading-line')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'No matching entity found' })).not.toBeInTheDocument();

      view.rerender(content({ ...pending, sdk, status: 'ready' }));
      expect(await screen.findByRole('heading', { name: 'No matching entity found' })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledOnce();
      expect(view.container.querySelector('.loading-line')).not.toBeInTheDocument();

      view.rerender(content({ ...pending, status: 'error', error: new Error('SDK connection failed') }));
      expect(screen.getByRole('heading', { name: 'Search unavailable' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'No matching entity found' })).not.toBeInTheDocument();
      expect(view.container.querySelector('.loading-line')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      queryClient.clear();
    }
  });
});
