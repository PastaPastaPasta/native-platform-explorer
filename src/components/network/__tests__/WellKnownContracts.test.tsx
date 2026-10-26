import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { WellKnownContracts } from '../WellKnownContracts';

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';
const OWNER = '11111111111111111111111111111111';

function contract(types: string[]) {
  return { ownerId: OWNER, documentSchemas: Object.fromEntries(types.map((t) => [t, {}])) };
}

afterEach(() => vi.unstubAllGlobals());

describe('home well-known contracts', () => {
  it('loads previews in one batched getMany once the list is hovered', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const getMany = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id === DPNS ? contract(['domain', 'preorder']) : undefined])));
    renderWithProviders(<WellKnownContracts />, { sdk: { sdk: createMockSdk({ contracts: { getMany } }) } });
    expect(getMany).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByRole('link', { name: /DPNS/ }).parentElement!);
    await screen.findByText(`2 doc types · owner 111111…1111`);
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany.mock.calls[0]![0]).toContain(DPNS);
    expect(screen.getAllByText('not on this network').length).toBeGreaterThan(0);
  });

  it('falls back to one request per contract when the batch cannot be decoded', async () => {
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => { cb(); return 1; });
    const getMany = vi.fn(async (ids: string[]) => {
      if (ids.length > 1) throw new Error('unable to deserialize DataContract');
      if (ids[0] === DASHPAY) throw new Error('unable to deserialize DataContract');
      return new Map([[ids[0]!, contract(['note'])]]);
    });
    renderWithProviders(<WellKnownContracts />, { sdk: { sdk: createMockSdk({ contracts: { getMany } }) } });
    await act(async () => {});
    expect((await screen.findAllByText('1 doc type · owner 111111…1111')).length).toBeGreaterThan(0);
    expect(screen.getByText('preview unavailable')).toBeInTheDocument();
  });
});
