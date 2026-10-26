import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { getNetwork, hasNetwork, removeCustomDevnet } from '@sdk/networks';
import { CustomDevnetModal } from '../CustomDevnetModal';

afterEach(() => { removeCustomDevnet('devnet-blank'); removeCustomDevnet('devnet-bad'); });

describe('CustomDevnetModal', () => {
  it('saves a devnet without DAPI addresses; the quorum service defaults from the name', () => {
    const onSaved = vi.fn();
    renderWithProviders(<CustomDevnetModal isOpen onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('devnet-mycoolnet'), { target: { value: 'devnet-blank' } });
    expect(screen.getByPlaceholderText('https://quorums.blank.networks.dash.org')).toBeInTheDocument();
    expect(screen.queryByText(/Required when no quorum URL/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));
    expect(onSaved).toHaveBeenCalledWith('devnet-blank');
    expect(getNetwork('devnet-blank')).toMatchObject({ type: 'devnet', name: 'devnet-blank' });
    expect(getNetwork('devnet-blank').dapiAddresses).toBeUndefined();
  });

  it.each([['devnet-mainnet', '"mainnet" is reserved'], ['devnet-', 'is empty'], ['devnet-bad-', 'hyphen']])(
    'requires a quorum service URL when %s cannot derive one', (name, reason) => {
      renderWithProviders(<CustomDevnetModal isOpen onClose={() => {}} />);
      fireEvent.change(screen.getByPlaceholderText('devnet-mycoolnet'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));
      expect(screen.getByText(new RegExp(`Required for this name.*${reason}`))).toBeInTheDocument();
      expect(hasNetwork(name)).toBe(false);
    },
  );

  it('still rejects malformed DAPI addresses', () => {
    renderWithProviders(<CustomDevnetModal isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('devnet-mycoolnet'), { target: { value: 'devnet-bad' } });
    fireEvent.change(screen.getByLabelText('DAPI addresses (optional)'), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));
    expect(screen.getByText('Not a valid HTTP(S) URL: not-a-url')).toBeInTheDocument();
    expect(hasNetwork('devnet-bad')).toBe(false);
  });
});
