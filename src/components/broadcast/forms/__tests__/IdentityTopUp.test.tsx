import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { IdentityTopUpForm } from '../IdentityTopUp';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BRIDGE_URL', 'https://bridge.dashhq.org');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IdentityTopUp bridge handoff', () => {
  it('keeps the manual bridge link available with a blank or invalid local identity', () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(<IdentityTopUpForm onOptionsChange={onOptionsChange} />);
    const bridge = screen.getByRole('link', { name: 'Open bridge →' });
    const identity = screen.getByRole('textbox', { name: 'Identity' });
    expect(identity).toHaveValue('');
    expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=testnet');
    expect(bridge).toHaveAttribute('target', '_blank');
    expect(bridge).toHaveAttribute('rel', 'noopener noreferrer');
    expect(bridge).not.toHaveAttribute('disabled');
    expect(bridge).not.toHaveAttribute('aria-disabled', 'true');
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(identity, { target: { value: 'invalid identity' } });

    expect(bridge).not.toHaveAttribute('disabled');
    expect(bridge).not.toHaveAttribute('aria-disabled', 'true');
    expect(bridge).toHaveAttribute('href', 'https://bridge.dashhq.org/?network=testnet');
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
  });

  it('retains identity and amount validation independently of the bridge link', () => {
    const onOptionsChange = vi.fn();
    renderWithProviders(<IdentityTopUpForm onOptionsChange={onOptionsChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Identity' }), {
      target: { value: ` ${'A'.repeat(43)} ` },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith({ identityId: 'A'.repeat(43), amountDash: '0.1' });

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Approximate amount (DASH)' }), {
      target: { value: '0' },
    });
    expect(onOptionsChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('link', { name: 'Open bridge →' })).not.toHaveAttribute('disabled');
  });

  it.each([
    { network: 'devnet-tadi' as const, url: 'https://bridge.dashhq.org' },
    { network: 'testnet' as const, url: '' },
    { network: 'testnet' as const, url: 'http://example.com' },
  ])('keeps unavailable bridge configurations hidden: $network / $url', ({ network, url }) => {
    vi.stubEnv('NEXT_PUBLIC_BRIDGE_URL', url);
    renderWithProviders(<IdentityTopUpForm onOptionsChange={vi.fn()} />, { sdk: { network } });
    expect(screen.queryByRole('link', { name: 'Open bridge →' })).not.toBeInTheDocument();
    expect(screen.getByText(/The bridge shortcut is unavailable/)).toBeInTheDocument();
  });
});
