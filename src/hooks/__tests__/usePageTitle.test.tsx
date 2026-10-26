import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatPageTitle, SITE_TITLE, usePageTitle } from '../usePageTitle';

function Titled({ title }: { title?: string | null }) {
  usePageTitle(title);
  return null;
}

afterEach(() => { document.title = ''; });

describe('page titles', () => {
  it('formats an entity title with the site name', () => {
    expect(formatPageTitle('alice.dash')).toBe('alice.dash — Native Platform Explorer');
    expect(formatPageTitle('  ')).toBe(SITE_TITLE);
    expect(formatPageTitle(null)).toBe(SITE_TITLE);
  });

  it('shows a generic title until the name loads, then the name, and resets on unmount', () => {
    const view = render(<Titled title="Identity 3sL6q6…xzE" />);
    expect(document.title).toBe('Identity 3sL6q6…xzE — Native Platform Explorer');
    view.rerender(<Titled title="alice.dash" />);
    expect(document.title).toBe('alice.dash — Native Platform Explorer');
    view.unmount();
    expect(document.title).toBe(SITE_TITLE);
  });

  it('lets the next page set its own title after the previous one unmounts', () => {
    const view = render(<Titled title="Epoch #42" />);
    view.rerender(<Titled key="next" title="Vote polls" />);
    expect(document.title).toBe('Vote polls — Native Platform Explorer');
  });
});
