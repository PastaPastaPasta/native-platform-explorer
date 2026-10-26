import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { copyLabelFor, Identifier } from '../Identifier';
import { renderWithProviders } from '@/test/render';

describe('Identifier avatar', () => {
  // Regression: passed as Chakra's `backgroundImage` prop, the identicon data
  // URL (whose SVG contains `hsl(…)`) went through the gradient parser and was
  // emitted as an invalid value, so every avatar rendered empty.
  it('renders the identicon as an image source', () => {
    const { container } = renderWithProviders(
      <Identifier value="2ZqDG9z97YZrhA3UuuoLfk4b4XQdaMgTUowS7hTw6wGK" avatar copy={false} />,
    );
    const avatar = container.querySelector('img[aria-hidden="true"]');
    expect(avatar?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg.*hsl\(/);
  });
});

describe('Identifier copy button', () => {
  it('names what it copies', () => {
    expect(copyLabelFor('/identity/?id=x')).toBe('Copy identity ID');
    expect(copyLabelFor('/identity/lookup/?pkh=x')).toBe('Copy public-key hash');
    expect(copyLabelFor('/contract/?id=x')).toBe('Copy contract ID');
    expect(copyLabelFor('/evonode/?proTxHash=x')).toBe('Copy proTxHash');
    expect(copyLabelFor(undefined)).toBe('Copy identifier');
  });

  it('uses an explicit label and wraps long values', () => {
    const value = 'a'.repeat(64);
    renderWithProviders(<Identifier value={value} copyLabel="Copy state transition hash" />);
    expect(screen.getByRole('button', { name: 'Copy state transition hash' })).toBeInTheDocument();
    expect(screen.getByText(value.slice(5, -5)).parentElement).toHaveStyle({ wordBreak: 'break-all' });
  });
});
