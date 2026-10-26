import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQueryProofStore } from '@contexts/QueryProofStore';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { SeededHoldersForm } from '../SeededHoldersForm';

const TOKEN = '8RsBCPSDUwWMnvLTDooh7ZcfZmnRb5tecsagsrdAFrrd';
const ALICE = 'DTFPLKMVbnkVQWEfkxHX7Ch62ytjvbtqH6eG1TF3nMbD';
const BOB = '3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE';

function InspectorMethods() {
  const store = useQueryProofStore();
  return <div data-testid="inspector">{store.entries.map((e) => `${e.methodName}:${e.status}`).join(',')}</div>;
}

describe('SeededHoldersForm', () => {
  it('reads seeded balances through the proof-aware query layer', async () => {
    const balances = vi.fn().mockResolvedValue(new Map([[ALICE, 5n]]));
    const balancesWithProof = vi.fn().mockResolvedValue({
      data: new Map([[ALICE, 7n], [BOB, 3n]]),
      metadata: { height: 10 },
      proof: { grovedbProof: new Uint8Array([1]) },
    });
    const resolveName = vi.fn().mockResolvedValue(BOB);
    const sdk = createMockSdk({ tokens: { balances, balancesWithProof }, dpns: { resolveName } });
    renderWithProviders(<><SeededHoldersForm tokenId={TOKEN} /><InspectorMethods /></>, { sdk: { sdk, trusted: true } });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: `${ALICE}\nbob.dash` } });
    fireEvent.click(screen.getByRole('button', { name: /Resolve & query/ }));

    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(resolveName).toHaveBeenCalledWith('bob.dash');
    expect(balancesWithProof).toHaveBeenCalledWith([ALICE, BOB], TOKEN);
    expect(balances).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('inspector')).toHaveTextContent('tokens.balances:success'));
    expect(screen.getByLabelText(/verified/i)).toBeInTheDocument();
  });
});
