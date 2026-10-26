import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { isStaleContractError, withContractRefresh } from '../contract-cache';
import { useDocument, useDocumentsQuery } from '../queries';

// The WasmSdkError shape: a plain object, not an Error.
const typeNotFound = { name: 'NotFound', kind: 28, message: 'Document type not found: document type avatar not found' };

describe('withContractRefresh', () => {
  it('recognises the errors a stale cached contract causes', () => {
    expect(isStaleContractError(typeNotFound)).toBe(true);
    expect(isStaleContractError(new Error('query syntax error: where clause on non indexed property error: score'))).toBe(true);
    expect(isStaleContractError({ name: 'NotFound', kind: 28, message: 'Data contract not found' })).toBe(false);
    expect(isStaleContractError(new Error('no available addresses to retry'))).toBe(false);
  });

  it('refreshes the contract once and retries once', async () => {
    const fetch = vi.fn().mockResolvedValue({ id: 'contract' });
    const read = vi.fn().mockRejectedValueOnce(typeNotFound).mockResolvedValueOnce('doc');
    await expect(withContractRefresh({ contracts: { fetch } } as never, 'contract', read)).resolves.toBe('doc');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('contract');
    expect(read).toHaveBeenCalledTimes(2);
    expect(fetch.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[1]!);
  });

  it('gives up after one retry, and keeps the original error when the refresh fails', async () => {
    const read = vi.fn().mockRejectedValue(typeNotFound);
    const fetch = vi.fn().mockResolvedValue({ id: 'contract' });
    await expect(withContractRefresh({ contracts: { fetch } } as never, 'contract', read)).rejects.toBe(typeNotFound);
    expect(read).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();

    const unreachable = new Error('no available addresses to retry');
    read.mockClear();
    await expect(withContractRefresh({ contracts: { fetch: vi.fn().mockRejectedValue(unreachable) } } as never, 'contract', read)).rejects.toBe(typeNotFound);
    await expect(withContractRefresh({ contracts: { fetch: vi.fn().mockResolvedValue(undefined) } } as never, 'contract', read)).rejects.toBe(typeNotFound);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not refetch for unrelated failures', async () => {
    const fetch = vi.fn();
    const unreachable = new Error('no available addresses to retry');
    await expect(withContractRefresh({ contracts: { fetch } } as never, 'contract', vi.fn().mockRejectedValue(unreachable))).rejects.toBe(unreachable);
    expect(fetch).not.toHaveBeenCalled();
  });
});

function DocumentProbe() {
  const q = useDocument('contract', 'avatar', 'doc-1');
  return <div data-testid="state">{q.status}:{String((q.data as { label?: string } | null)?.label ?? '')}</div>;
}

function QueryProbe() {
  const q = useDocumentsQuery({ dataContractId: 'contract', documentTypeName: 'avatar', limit: 1 });
  return <div data-testid="state">{q.status}:{Array.isArray(q.data) ? q.data.length : ''}</div>;
}

describe('document reads after a contract changed on chain', () => {
  it.each([true, false])('documents.get refreshes the cached contract and retries (trusted: %s)', async (trusted) => {
    const fetch = vi.fn().mockResolvedValue({ id: 'contract' });
    const get = vi.fn().mockRejectedValueOnce(typeNotFound).mockResolvedValueOnce({ label: 'fresh' });
    const getWithProof = vi.fn().mockRejectedValueOnce(typeNotFound).mockResolvedValueOnce({ data: { label: 'fresh' } });
    const sdk = createMockSdk({ contracts: { fetch }, documents: { get, getWithProof } });
    renderWithProviders(<DocumentProbe />, { sdk: { sdk, trusted } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:fresh'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('contract');
  });

  it('documents.query refreshes the cached contract and retries', async () => {
    const fetch = vi.fn().mockResolvedValue({ id: 'contract' });
    const query = vi.fn().mockRejectedValueOnce(typeNotFound).mockResolvedValueOnce([{ $id: 'doc-1' }]);
    const sdk = createMockSdk({ contracts: { fetch }, documents: { query } });
    renderWithProviders(<QueryProbe />, { sdk: { sdk, trusted: false } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('success:1'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('contract');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
