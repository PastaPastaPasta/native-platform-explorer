import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TokenFlagsPills } from '../TokenFlagsPills';

describe('TokenFlagsPills', () => {
  it('shows on capabilities, marks unreadable ones unknown, and omits off ones', () => {
    renderWithProviders(<TokenFlagsPills flags={{ mintable: true, burnable: 'unknown', freezable: false }} />);
    expect(screen.getByText('mintable')).toBeInTheDocument();
    expect(screen.getByText('burnable: unknown')).toHaveAttribute('title', expect.stringMatching(/could not read/));
    expect(screen.queryByText(/freezable/)).not.toBeInTheDocument();
  });
});
