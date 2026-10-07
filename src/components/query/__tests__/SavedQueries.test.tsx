import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '@/test/render';
import { savedQueriesKey } from '@util/query-workspace';
import { SavedQueries } from '../SavedQueries';

const sql = "SELECT * FROM domain WHERE label == 'private filter'";

function storageEvent(
  key: string | null,
  storageArea = localStorage,
  newValue: string | null = null,
) {
  fireEvent(window, new StorageEvent('storage', { key, storageArea, newValue }));
}

describe('Saved queries controls', () => {
  it('preserves another tab save when this tab saves before its storage event', () => {
    const key = savedQueriesKey('testnet', 'one');
    const first = { name: 'First', sql };
    const remote = { name: 'Remote', sql: 'SELECT * FROM domain LIMIT 2' };
    localStorage.setItem(key, JSON.stringify([first]));
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={vi.fn()} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Local' } });
    // The other tab has committed, but its native storage event is still queued.
    localStorage.setItem(key, JSON.stringify([first, remote]));
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([first, remote, { name: 'Local', sql }]);
  });

  it('deleting a stale absent row preserves remote additions and does not resurrect removed rows', () => {
    const key = savedQueriesKey('testnet', 'one');
    localStorage.setItem(
      key,
      JSON.stringify([
        { name: 'Removed', sql },
        { name: 'Also removed', sql },
      ]),
    );
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={vi.fn()} />
      </TestProviders>,
    );
    const remote = { name: 'Remote', sql: 'SELECT * FROM domain LIMIT 2' };
    localStorage.setItem(key, JSON.stringify([remote]));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved query Removed' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([remote]);
    expect(
      screen.queryByRole('button', { name: 'Also removed' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remote' })).toBeInTheDocument();
  });

  it('rejects a stale save at the fresh storage limit instead of discarding another query', () => {
    const key = savedQueriesKey('testnet', 'one');
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={vi.fn()} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), {
      target: { value: 'Would be twenty-first' },
    });
    const full = Array.from({ length: 20 }, (_, i) => ({ name: `Query ${i}`, sql }));
    localStorage.setItem(key, JSON.stringify(full));
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(full);
    expect(screen.getByText(/You can save up to 20 queries/)).toBeInTheDocument();
    expect(screen.getByLabelText('Query name')).toHaveValue('Would be twenty-first');
  });

  it('replaces an existing name at the fresh storage limit', () => {
    const key = savedQueriesKey('testnet', 'one');
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={vi.fn()} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Query 5' } });
    const full = Array.from({ length: 20 }, (_, i) => ({
      name: `Query ${i}`,
      sql: 'SELECT * FROM domain LIMIT 1',
    }));
    localStorage.setItem(key, JSON.stringify(full));
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([
      ...full.filter((query) => query.name !== 'Query 5'),
      { name: 'Query 5', sql },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Saved queries updated.');
  });

  it('syncs the latest stored list rather than a queued event snapshot and retains drafts', () => {
    const key = savedQueriesKey('testnet', 'one');
    const onLoad = vi.fn();
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), {
      target: { value: 'Unfinished draft' },
    });
    const remote = { name: 'Remote', sql: 'SELECT * FROM domain LIMIT 2' };
    localStorage.setItem(key, JSON.stringify([remote]));
    storageEvent(key, localStorage, JSON.stringify([{ name: 'Obsolete', sql }]));
    expect(screen.getByRole('button', { name: 'Remote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Obsolete' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Query name')).toHaveValue('Unfinished draft');
    expect(onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([
      remote,
      { name: 'Unfinished draft', sql },
    ]);
  });

  it('syncs remote removal and whole-storage clearing without discarding the name draft', () => {
    const key = savedQueriesKey('testnet', 'one');
    localStorage.setItem(key, JSON.stringify([{ name: 'Remote', sql }]));
    const onLoad = vi.fn();
    render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Draft' } });
    localStorage.removeItem(key);
    storageEvent(key);
    expect(screen.queryByRole('button', { name: 'Remote' })).not.toBeInTheDocument();
    localStorage.setItem(key, JSON.stringify([{ name: 'Remote again', sql }]));
    storageEvent(key);
    expect(screen.getByRole('button', { name: 'Remote again' })).toBeInTheDocument();
    localStorage.clear();
    storageEvent(null);
    expect(
      screen.queryByRole('button', { name: 'Remote again' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Query name')).toHaveValue('Draft');
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('ignores other storage areas and scopes and removes the old scope listener', () => {
    const oldKey = savedQueriesKey('testnet', 'one');
    const newKey = savedQueriesKey('mainnet', 'two');
    localStorage.setItem(oldKey, JSON.stringify([{ name: 'Old scope', sql }]));
    const onLoad = vi.fn();
    const { rerender, unmount } = render(
      <TestProviders>
        <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    const read = vi.spyOn(localStorage, 'getItem');
    read.mockClear();
    storageEvent(oldKey, sessionStorage);
    storageEvent(null, sessionStorage);
    storageEvent(newKey);
    expect(read).not.toHaveBeenCalled();
    rerender(
      <TestProviders>
        <SavedQueries network="mainnet" contractId="two" sql={sql} onLoad={onLoad} />
      </TestProviders>,
    );
    fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'New draft' } });
    read.mockClear();
    storageEvent(oldKey);
    expect(read).not.toHaveBeenCalled();
    localStorage.setItem(newKey, JSON.stringify([{ name: 'New scope', sql }]));
    storageEvent(newKey);
    expect(screen.getByRole('button', { name: 'New scope' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Old scope' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Query name')).toHaveValue('New draft');
    unmount();
    read.mockClear();
    storageEvent(newKey);
    expect(read).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'] as const)(
    'preserves the visible list and draft when a storage %s fails',
    (failure) => {
      const key = savedQueriesKey('testnet', 'one');
      const existing = { name: 'Existing', sql };
      localStorage.setItem(key, JSON.stringify([existing]));
      render(
        <TestProviders>
          <SavedQueries network="testnet" contractId="one" sql={sql} onLoad={vi.fn()} />
        </TestProviders>,
      );
      fireEvent.change(screen.getByLabelText('Query name'), { target: { value: 'Draft' } });
      const set = vi.spyOn(localStorage, 'setItem');
      const remove = vi.spyOn(localStorage, 'removeItem');
      const failing = vi
        .spyOn(localStorage, failure === 'read' ? 'getItem' : 'setItem')
        .mockImplementation(() => {
          throw new Error('denied');
        });
      if (failure === 'read') storageEvent(key);
      fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
      expect(screen.getByRole('status')).toHaveTextContent('Could not save queries.');
      expect(screen.getByRole('button', { name: 'Existing' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Draft' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Query name')).toHaveValue('Draft');
      if (failure === 'read') expect(set).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      failing.mockRestore();
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual([existing]);
    },
  );

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
