import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { DocumentsLanding } from '../DocumentsLanding';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

function contract() {
  return { id: DPNS, ownerId: '11111111111111111111111111111111', documentSchemas: { domain: {}, preorder: {} } };
}

describe('documents landing', () => {
  it('validates the contract ID before loading', () => {
    renderWithProviders(<DocumentsLanding />);
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: 'nope' } });
    expect(screen.getByText('Expected a 43–44 char base58 contract ID.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load types' })).toBeDisabled();
  });

  it('lists the chosen contract’s document types as links', async () => {
    const fetch = vi.fn().mockResolvedValue(contract());
    renderWithProviders(<DocumentsLanding />, { sdk: { sdk: createMockSdk({ contracts: { fetch } }) } });
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: DPNS } });
    fireEvent.click(screen.getByRole('button', { name: 'Load types' }));
    expect((await screen.findByRole('link', { name: 'domain' })).getAttribute('href')).toMatch(new RegExp(`/contract/documents/?\\?id=${DPNS}&type=domain$`));
    expect(screen.getByRole('link', { name: 'preorder' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(DPNS);
  });

  it('preselects a contract given without a type and offers well-known contracts', async () => {
    const fetch = vi.fn().mockResolvedValue(contract());
    renderWithProviders(<DocumentsLanding initialContractId={DPNS} />, { sdk: { sdk: createMockSdk({ contracts: { fetch } }) } });
    expect(await screen.findByRole('link', { name: 'domain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DPNS' })).toBeInTheDocument();
  });
});
