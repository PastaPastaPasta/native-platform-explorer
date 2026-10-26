import { describe, expect, it } from 'vitest';
import { Identifier } from '../Identifier';
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
