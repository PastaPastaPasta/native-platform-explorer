'use client';

import { parseAsStringLiteral, useQueryState } from 'nuqs';

/**
 * Keep a Chakra `<Tabs>` selection in the URL (`?tab=keys`) so tabs are
 * linkable and survive reloads. The first tab is the default and is omitted
 * from the URL.
 */
export function useTabParam<const T extends readonly [string, ...string[]]>(tabs: T, key = 'tab') {
  const [tab, setTab] = useQueryState(key, parseAsStringLiteral(tabs).withDefault(tabs[0]));
  const index = Math.max(0, tabs.indexOf(tab));
  return {
    tab,
    index,
    onChange: (next: number) => void setTab(tabs[next] ?? tabs[0]),
  };
}
