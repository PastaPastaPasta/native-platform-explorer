import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { normalizeError } from '@sdk/errors';
import { ErrorCard } from '../ErrorCard';

/** Getter-shaped rc.2 WasmSdkError for a quorum the trusted context lacks. */
const missingQuorum = normalizeError(Object.create({
  get kind() { return 18; },
  get name() { return 'ContextProviderError'; },
  get message() { return 'Quorum not found in cache for hash 0000004c…'; },
}));

describe('ErrorCard', () => {
  it('offers Reconnect instead of Retry for a missing quorum', () => {
    const reconnect = vi.fn();
    const onRetry = vi.fn();
    renderWithProviders(<ErrorCard error={missingQuorum} onRetry={onRetry} />, { sdk: { reconnect } });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByText(/fetches a fresh list/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(reconnect).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('keeps Retry for other errors and outside an SDK provider', () => {
    const reconnect = vi.fn();
    const onRetry = vi.fn();
    const view = renderWithProviders(<ErrorCard error={new Error('offline')} onRetry={onRetry} />, { sdk: { reconnect } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(reconnect).not.toHaveBeenCalled();
    view.unmount();
    render(<ErrorCard error={missingQuorum} onRetry={onRetry} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
