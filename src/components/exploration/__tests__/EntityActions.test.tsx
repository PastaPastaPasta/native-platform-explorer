import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityActions, ShareLinkButton } from '../EntityActions';
import { getSavedEntities } from '@util/exploration';

const state = vi.hoisted(() => ({ network: 'testnet' }));
vi.mock('@sdk/hooks', () => ({ useSdk: () => state }));

const id = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

describe('entity exploration actions', () => {
  beforeEach(() => { state.network = 'testnet'; });

  it('saves, synchronizes buttons, and removes the active network bookmark', () => {
    render(<><EntityActions kind="identity" id={id} /><EntityActions kind="identity" id={id} /></>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save identity' })[0]!);
    expect(screen.getAllByRole('button', { name: 'Remove saved identity' })).toHaveLength(2);
    expect(getSavedEntities()).toMatchObject([{ kind: 'identity', id, network: 'testnet' }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove saved identity' })[1]!);
    expect(screen.getAllByRole('button', { name: 'Save identity' })).toHaveLength(2);
    expect(getSavedEntities()).toEqual([]);
  });

  it('does not claim that a failed storage write succeeded', () => {
    render(<EntityActions kind="contract" id={id} />);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    fireEvent.click(screen.getByRole('button', { name: 'Save contract' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Quota exceeded');
    expect(screen.getByRole('button', { name: 'Save contract' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the save state separate when the user switches networks', () => {
    const view = render(<EntityActions kind="token" id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
    state.network = 'mainnet';
    view.rerender(<EntityActions kind="token" id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
    expect(getSavedEntities().map((item) => item.network)).toEqual(['mainnet', 'testnet']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved token' }));
    expect(getSavedEntities().map((item) => item.network)).toEqual(['testnet']);
  });

  it('copies a full share URL containing the selected network', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShareLinkButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied for testnet.'));
    expect(new URL(writeText.mock.calls[0]![0] as string).searchParams.get('network')).toBe('testnet');
  });

  it('reports clipboard errors without claiming success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<ShareLinkButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not copy the link.'));
  });
});
