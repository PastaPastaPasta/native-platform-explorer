import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { activeHref, NAV_GROUPS, SidebarNavBody } from '../SidebarRail';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

describe('sidebar navigation', () => {
  it('links every reachable top-level page', () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const page of ['/settings/', '/groups/', '/network/quorums/', '/network/credits/', '/network/shielded/', '/epoch/history/']) {
      expect(hrefs).toContain(page);
    }
  });

  it('marks only the most specific item as current', () => {
    expect(activeHref('/epoch/history/')).toBe('/epoch/history/');
    expect(activeHref('/epoch/detail/')).toBe('/epoch/');
    expect(activeHref('/')).toBe('/');
    expect(activeHref('/network/quorums')).toBe('/network/quorums/');
    expect(activeHref('/identity/lookup/')).toBe('/identity/');
    expect(activeHref('/network/shielded/')).toBe('/network/shielded/');
    nav.pathname = '/epoch/history/';
    render(<SidebarNavBody />);
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Epoch history']);
  });
});
