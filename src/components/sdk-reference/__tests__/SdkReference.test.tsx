import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import { SdkReference } from '../SdkReference';
import { filterReference } from '../reference';
import reference from '@/data/sdk-reference.json';

vi.mock('@hooks/usePageBreadcrumbs', () => ({ usePageBreadcrumbs: vi.fn() }));
// Reading documentation must not import SDK hooks or the WASM SDK.
vi.mock('@sdk/hooks', () => { throw new Error('SDK reference loaded SDK hooks'); });
vi.mock('@dashevo/evo-sdk', () => { throw new Error('SDK reference loaded the SDK'); });

describe('SDK reference', () => {
  it('matches page names, methods and hooks without mutating generated data', () => {
    expect(filterReference(reference.pages, ' /NETWORK/STATUS/ ', '')[0]?.calls.length).toBe(2);
    const calls = filterReference(reference.pages, 'epochsInfoWithProof', '/epoch/')[0]?.calls;
    expect(calls?.map((call) => call.method)).toEqual(['epoch.epochsInfoWithProof']);
    expect(filterReference(reference.pages, 'useIdentityBalanceAndRevision', '/identity/')[0]?.calls.length).toBe(2);
    expect(filterReference(reference.pages, 'definitely-not-a-call', '')).toEqual([]);
    expect(filterReference(reference.pages, '', '/sdk-reference/')[0]?.calls).toEqual([]);
    expect(reference.pages.find((page) => page.route === '/epoch/')?.calls.length).toBe(4);
  });

  it('supports route filtering, accessible searching, empty recovery and local-only pages without an SDK', () => {
    render(<ChakraProvider><SdkReference /></ChakraProvider>);
    expect(screen.getByRole('heading', { level: 1, name: 'SDK reference' })).toBeInTheDocument();
    expect(screen.queryByText(/implemented in Stage|Stage 5\/6/)).not.toBeInTheDocument();
    const route = screen.getByLabelText('Filter by page');
    const search = screen.getByRole('textbox', { name: 'Search pages or SDK calls' });
    fireEvent.change(route, { target: { value: '/query/' } });
    const query = screen.getByRole('region', { name: '/query/' });
    expect(within(query).getByText('documents.queryWithProof')).toBeInTheDocument();
    expect(within(query).getByText('getDocumentsAverage')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`1 of ${reference.pages.length} pages`);
    fireEvent.change(search, { target: { value: 'getDocumentsCount' } });
    expect(within(query).getByText('getDocumentsCount')).toBeInTheDocument();
    expect(within(query).queryByText('documents.query')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'no-such-method' } });
    expect(screen.getByText('No pages or SDK calls match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(search).toHaveValue('');
    expect(route).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(`${reference.pages.length} of ${reference.pages.length} pages`);
    fireEvent.change(route, { target: { value: '/sdk-reference/' } });
    expect(screen.getByText('No page-specific SDK calls. This page uses local data, settings, or navigation.')).toBeInTheDocument();
  });
});
