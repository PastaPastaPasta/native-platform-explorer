'use client';

import { useEffect, useRef } from 'react';

export const SITE_TITLE = 'Native Platform Explorer';

/** `alice.dash — Native Platform Explorer`; the bare site title without a page title. */
export function formatPageTitle(title?: string | null): string {
  const page = title?.trim();
  return page ? `${page} — ${SITE_TITLE}` : SITE_TITLE;
}

// Every mounted caller registers its title; the most recently mounted one
// wins. Next.js writes the layout's metadata <title> after hydration and again
// on navigations (including nuqs URL updates), so one observer re-applies the
// winning title whenever <head> changes.
const owners: Array<{ title: string }> = [];
let observer: MutationObserver | null = null;

function apply() {
  const wanted = owners.at(-1)?.title ?? SITE_TITLE;
  if (document.title !== wanted) document.title = wanted;
}

function register(owner: { title: string }) {
  owners.push(owner);
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  }
  apply();
}

function unregister(owner: { title: string }) {
  const index = owners.indexOf(owner);
  if (index >= 0) owners.splice(index, 1);
  apply();
  if (owners.length === 0) {
    observer?.disconnect();
    observer = null;
  }
}

/** Set the document title while the calling page is mounted. Pass a generic
 *  title until the entity's own name loads, then the name. */
export function usePageTitle(title?: string | null): void {
  const formatted = formatPageTitle(title);
  // One stable entry per mounted caller; title changes update it in place.
  const owner = useRef({ title: formatted });
  useEffect(() => {
    const entry = owner.current;
    register(entry);
    return () => unregister(entry);
  }, []);
  useEffect(() => {
    owner.current.title = formatted;
    apply();
  }, [formatted]);
}
