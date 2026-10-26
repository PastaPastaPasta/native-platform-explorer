import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { GlobalSearchInput, SEARCH_DEBOUNCE_MS, searchHint } from '../GlobalSearchInput';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.useRealTimers());

describe('header search', () => {
  it('names what a query looks like', () => {
    expect(searchHint('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec')).toBe('ID · name');
    expect(searchHint('a'.repeat(64))).toBe('hash');
    expect(searchHint('alice.dash')).toBe('name');
    expect(searchHint('42')).toBe('epoch');
    expect(searchHint('!!')).toBe('no match');
    expect(searchHint('')).toBeNull();
  });

  it('classifies only after typing pauses for 200 ms', async () => {
    vi.useFakeTimers();
    renderWithProviders(<GlobalSearchInput />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    fireEvent.change(input, { target: { value: 'alice.dash' } });
    await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1); });
    expect(screen.queryByText('name')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('name');
  });
});
