import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '@/test/render';
import { savedQueriesKey } from '@util/query-workspace';
import { SavedQueries } from '../SavedQueries';

const sql = "SELECT * FROM domain WHERE label == 'private filter'";

describe('Saved queries controls', () => {
  it('saves only on explicit action and loads the SQL without executing it', () => {
    const onLoad = vi.fn();
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="contract-one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    const key = savedQueriesKey('testnet', 'contract-one');
    expect(localStorage.getItem(key)).toBeNull();
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Private query' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{ name: 'Private query', sql }]);
    fireEvent.click(screen.getByRole('button', { name: 'Private query' }));
    expect(onLoad).toHaveBeenCalledWith(sql);
  });

  it('isolates saved queries across networks and contracts and clears the selected scope', () => {
    localStorage.setItem(
      savedQueriesKey('testnet', 'one'),
      JSON.stringify([{ name: 'Testnet query', sql }]),
    );
    localStorage.setItem(
      savedQueriesKey('mainnet', 'one'),
      JSON.stringify([{ name: 'Mainnet query', sql }]),
    );
    localStorage.setItem(
      savedQueriesKey('mainnet', 'two'),
      JSON.stringify([{ name: 'Other contract query', sql }]),
    );
    const onLoad = vi.fn();
    const { rerender } = render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    expect(screen.getByRole('button', { name: 'Testnet query' })).toBeInTheDocument();
    rerender(
      <TestProviders>
        <SavedQueries network="mainnet" contractId="one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    expect(screen.queryByRole('button', { name: 'Testnet query' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mainnet query' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other contract query' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved queries for this contract' }));
    expect(localStorage.getItem(savedQueriesKey('mainnet', 'one'))).toBeNull();
    expect(localStorage.getItem(savedQueriesKey('testnet', 'one'))).not.toBeNull();
    expect(localStorage.getItem(savedQueriesKey('mainnet', 'two'))).not.toBeNull();
  });
});
