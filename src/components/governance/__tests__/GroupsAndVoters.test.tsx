import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { GroupActionCard, summarizeGroupAction } from '../GroupActionCard';
import { ContenderVoters } from '../ContenderVoters';

const CONTRACT = 'EJ3pTnDkFJ7gWqY1H2fy7i81kKvfxg3pgFdM4u8cRFtv';
const ACTION = '4qBF7tKRcPaoieySCj9WEE3hhyBig1kSYzo9Z7XP7Frt';
const A = 'AQV2G2Egvqk8jwDBAcpngjKYcwAkck8Cecs5AjYJxfvW';
const B = 'DTFPLKMVbnkVQWEfkxHX7Ch62ytjvbtqH6eG1TF3nMbD';
const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

// Live testnet GroupAction.toJSON() for a closed price change.
const actionJson = {
  $formatVersion: '0',
  contract_id: CONTRACT,
  proposer_id: B,
  token_contract_position: 0,
  event: { type: 'tokenEvent', data: { type: 'changePriceForDirectPurchase', data: [{ SinglePrice: 10000000000 }, null] } },
};
const action = { toJSON: () => actionJson };

describe('GroupActionCard', () => {
  it('summarizes the action and lists signers with their power against the threshold', async () => {
    expect(summarizeGroupAction(action)).toMatchObject({ proposerId: B, tokenPosition: 0, eventType: 'tokenEvent', kind: 'changePriceForDirectPurchase' });
    const signers = new Map([[A, 1n], [B, 1n]]);
    const group = {
      actionSigners: vi.fn().mockResolvedValue(signers),
      actionSignersWithProof: vi.fn().mockResolvedValue({ data: signers }),
    };
    renderWithProviders(
      <GroupActionCard contractId={CONTRACT} position={0} status="CLOSED" actionId={ACTION} action={action} requiredPower={2} />,
      { sdk: { sdk: createMockSdk({ group }) } },
    );
    expect(screen.getByText('changePriceForDirectPurchase')).toBeVisible();
    expect(screen.getByText('[{"SinglePrice":10000000000},null]')).toBeVisible();
    const table = await screen.findByRole('table', { name: `Signers of action ${ACTION}` });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Signers — 2 of 2 power')).toBeVisible();
    const call = [...group.actionSigners.mock.calls, ...group.actionSignersWithProof.mock.calls][0]!;
    expect(call[0]).toEqual({ dataContractId: CONTRACT, groupContractPosition: 0, status: 'CLOSED', actionId: ACTION });
  });

  it('summarizes the evo-sdk 5.0 toJSON() form', () => {
    // 5.0.0-rc.8 GroupActionJSON: the event is tagged with `$kind` and the
    // token event's `$type` and fields are flattened beside it.
    const mint = { toJSON: () => ({
      ...actionJson,
      event: { $kind: 'tokenEvent', $type: 'mint', amount: 5, recipient: A, publicNote: null },
    }) };
    expect(summarizeGroupAction(mint)).toMatchObject({
      proposerId: B, tokenPosition: 0, eventType: 'tokenEvent', kind: 'mint',
      payload: { amount: 5, recipient: A, publicNote: null },
    });
  });
});

describe('ContenderVoters', () => {
  const base = { contractId: DPNS, docType: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'a1pha'], contestantId: A };

  it('explains that decided contests no longer have individual votes', async () => {
    const group = { contestedResourceVotersForIdentity: vi.fn().mockResolvedValue([]), contestedResourceVotersForIdentityWithProof: vi.fn().mockResolvedValue({ data: [] }) };
    renderWithProviders(<ContenderVoters {...base} isFinished />, { sdk: { sdk: createMockSdk({ group }) } });
    expect(await screen.findByText(/Platform deletes individual votes once a contest is decided/)).toBeVisible();
  });

  it('pages voters with an exclusive start-after cursor', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => `${'1'.repeat(10)}${String(i).padStart(2, '0')}${'A'.repeat(31)}`);
    const page2 = [B];
    const fetch = vi.fn(async (q: { startAtVoterId?: string }) => (q.startAtVoterId ? page2 : page1));
    const group = {
      contestedResourceVotersForIdentity: fetch,
      contestedResourceVotersForIdentityWithProof: vi.fn(async (q: { startAtVoterId?: string }) => ({ data: await fetch(q) })),
    };
    renderWithProviders(<ContenderVoters {...base} isFinished={false} />, { sdk: { sdk: createMockSdk({ group }) } });
    expect(await screen.findByText('page 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('page 2')).toBeVisible();
    const last = fetch.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ contestantId: A, indexValues: ['dash', 'a1pha'], limit: 50, startAtVoterId: page1[49], startAtIncluded: false });
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });
});
