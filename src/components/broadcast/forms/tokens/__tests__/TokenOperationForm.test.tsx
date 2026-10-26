import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSigner } from '@/test/signer';
import { TokenOperationForm } from '../TokenOperationForm';
import type { TokenOperationKind } from '../../../tokens/options';
import type { TokenSnapshot } from '../../../tokens/state';
import { pendingActionFromJson } from '../../../tokens/group-actions';
import {
  ACTION_ID,
  CONTRACT_ID,
  MAX_SUPPLY_ACTION,
  MEMBER,
  OWNER,
  TOKEN_ID,
  snapshot as makeSnapshot,
} from '../../../tokens/__tests__/fixtures';

const state = vi.hoisted(() => ({ snapshot: undefined as TokenSnapshot | undefined, actions: new Map() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ token: TOKEN_ID }) }));
vi.mock('@sdk/hooks', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSdkQuery: (key: unknown[]) => ({
    data: key[1] === 'target' ? { tokenId: TOKEN_ID, contractId: CONTRACT_ID, position: 0 } : state.snapshot,
    isLoading: false,
    isFetching: false,
    error: null,
  }),
}));
vi.mock('@sdk/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGroupActions: () => ({ data: state.actions, isLoading: false }),
}));

function renderForm(kind: TokenOperationKind, identityId = OWNER) {
  const onOptionsChange = vi.fn();
  renderWithProviders(
    <TokenOperationForm kind={kind} signer={createMockSigner({ identityId })} network="testnet" onOptionsChange={onOptionsChange} />,
  );
  return onOptionsChange;
}

beforeEach(() => {
  state.snapshot = makeSnapshot();
  state.actions = new Map();
});

describe('TokenOperationForm', () => {
  it('builds exact base-unit inputs from a display amount', async () => {
    const onOptionsChange = renderForm('mint');
    expect(screen.getByText('npetok')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '1.5' } });
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'mint', amount: 150_000_000n, recipientId: OWNER, chooseRecipient: true, signerId: OWNER }),
      ),
    );
  });

  it('explains why an unauthorized signer cannot mint', () => {
    const onOptionsChange = renderForm('mint', MEMBER);
    expect(screen.getByText(/Unavailable: Only the contract owner/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument();
    expect(onOptionsChange).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'mint' }));
  });

  it('shows what blocks review instead of offering it', async () => {
    state.snapshot = makeSnapshot({ paused: true });
    const onOptionsChange = renderForm('transfer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipient identity' }), { target: { value: MEMBER } });
    expect(await screen.findByText('The token is paused: transfers are stopped until it is resumed.')).toBeInTheDocument();
    expect(onOptionsChange).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'transfer' }));
  });

  it('prices a direct purchase exactly at the current price', async () => {
    state.snapshot = makeSnapshot({ price: { first: 1n, last: 1n }, credits: 10n ** 12n });
    const onOptionsChange = renderForm('directPurchase', MEMBER);
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '2' } });
    expect(await screen.findByText(/Total: 200000000 credits at 1 credits per base unit/)).toBeInTheDocument();
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxTotalCost: 200_000_000n, reviewedPrice: { first: 1n, last: 1n } })),
    );
  });

  it('proposes or co-signs changes a group governs and shows the power required', async () => {
    state.actions = new Map([[ACTION_ID, MAX_SUPPLY_ACTION]]);
    state.snapshot = makeSnapshot({ pending: pendingActionFromJson(ACTION_ID, 0, MAX_SUPPLY_ACTION, new Map([[OWNER, 1n]])) });
    const onOptionsChange = renderForm('configUpdate', MEMBER);
    expect(await screen.findByText('Group #0 approval')).toBeInTheDocument();
    expect(screen.queryByText(/Act alone/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Co-sign a pending action' }));
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(ACTION_ID) }));
    expect(await screen.findByText(/Signed so far: 1 of 2 power/)).toHaveTextContent('which completes the action and executes it');
    expect(screen.getByText(/Co-signing repeats the proposed change: Sets the max supply to 2,000,000 npetok/)).toBeInTheDocument();
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'configUpdate',
          change: { item: 'maxSupply', value: 200_000_000_000_000n },
          group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID },
        }),
      ),
    );
  });

  it('builds a tiered price schedule in base units', async () => {
    const onOptionsChange = renderForm('setPrice');
    fireEvent.click(screen.getByRole('radio', { name: 'Tiered by amount' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tier 1 minimum amount' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tier 1 price per base unit' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tier' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tier 2 minimum amount' }), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tier 2 price per base unit' }), { target: { value: '1' } });
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          schedule: { type: 'tiers', tiers: [{ minAmount: 100_000_000n, price: 2n }, { minAmount: 500_000_000n, price: 1n }] },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Single price' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Price per base unit (credits)' }), { target: { value: '3' } });
    expect(screen.getByText(/= 300,000,000 credits/)).toBeInTheDocument();
  });

  it('hands a rule to no one only as an explicit, governed change', async () => {
    const onOptionsChange = renderForm('configUpdate');
    fireEvent.change(screen.getByRole('combobox', { name: 'Configuration item' }), { target: { value: 'rule:freeze:authorized' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'New authority type' }), { target: { value: 'noOne' } });
    expect(await screen.findByText('Lets no one act on freezing.')).toBeInTheDocument();
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ change: { item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'noOne' } } }),
      ),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Configuration item' }), { target: { value: 'maxSupply' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New max supply' }), { target: { value: '0.5' } });
    expect(await screen.findByText(/below the current total supply/)).toBeInTheDocument();
  });
});
