import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { StateTransitionWaitTimeout } from '@sdk/queries';
import {
  StateTransitionResultView,
  summariseStateTransitionResult,
  validateStateTransitionHash,
} from '../StateTransitionResultView';

const base = { data: undefined as unknown, error: null as Error | null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };

afterEach(() => vi.useRealTimers());

describe('state transition lookup', () => {
  it('validates the hash', () => {
    expect(validateStateTransitionHash('a'.repeat(64))).toBeNull();
    expect(validateStateTransitionHash('a'.repeat(63))).toMatch(/64-character/);
    expect(validateStateTransitionHash('g'.repeat(64))).toMatch(/64-character/);
  });

  it('shows a spinner with elapsed time while Platform has not answered', async () => {
    vi.useFakeTimers();
    renderWithProviders(<StateTransitionResultView query={{ ...base, isLoading: true, isFetching: true }} />);
    // The live region holds only the static sentence, not the ticking counter.
    expect(screen.getByRole('status')).toHaveTextContent(/^Waiting for Platform to report the result…$/);
    expect(screen.getByText('0 s')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByText('3 s')).toBeInTheDocument();
    expect(screen.getByText(/Gives up after 60 s/)).toBeInTheDocument();
  });

  it('reports a timeout as "no result yet" with Retry', () => {
    const refetch = vi.fn();
    renderWithProviders(<StateTransitionResultView query={{ ...base, isError: true, error: new StateTransitionWaitTimeout('Platform reported no result within 60 s.'), refetch }} />);
    expect(screen.getByRole('heading', { name: 'No result yet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows a structured result with the raw response behind a disclosure', () => {
    const data = { status: 'SUCCESS', state_transition_hash: 'ab'.repeat(32) };
    renderWithProviders(<StateTransitionResultView query={{ ...base, data }} />);
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('ab'.repeat(32))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy code block contents' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show raw response' }));
    expect(screen.getByRole('button', { name: 'Copy code block contents' })).toBeInTheDocument();
  });

  it('summarises an execution error', () => {
    expect(summariseStateTransitionResult({ status: 'ERROR', error: 'insufficient balance', state_transition_hash: 'ff' }))
      .toEqual({ status: 'ERROR', error: 'insufficient balance', hash: 'ff' });
    expect(summariseStateTransitionResult(null)).toEqual({ status: null, error: null, hash: null });
  });
});
