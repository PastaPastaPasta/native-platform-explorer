'use client';

import { useDpnsUsernames } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { usePageTitle } from './usePageTitle';
import { useWellKnownName } from './useWellKnownName';

// One-line title hooks for entity pages. Each shows a generic title until the
// entity's name is known. They read queries the page already runs (same cache
// keys), so they add no requests.

/** `alice.dash`, else the well-known name, else `Identity 3sL6q6…xzE`. */
export function useIdentityTitle(id: string | undefined): void {
  const aliasesQ = useDpnsUsernames(id || undefined);
  const wellKnown = useWellKnownName(id);
  const aliases = Array.isArray(aliasesQ.data) ? (aliasesQ.data as unknown[]) : [];
  const alias = aliases.find((name): name is string => typeof name === 'string' && name.length > 0);
  usePageTitle(id ? (alias ?? wellKnown?.name ?? `Identity ${shortId(id)}`) : 'Identities');
}

/** A well-known name, else `Contract GWRSAV…1Ec`. */
export function useContractTitle(id: string | undefined): void {
  const wellKnown = useWellKnownName(id);
  usePageTitle(id ? (wellKnown?.name ?? `Contract ${shortId(id)}`) : 'Contracts');
}

/** A well-known name, else `Token DYqxCs…mmd`. */
export function useTokenTitle(id: string | undefined): void {
  const wellKnown = useWellKnownName(id);
  usePageTitle(id ? (wellKnown?.name ?? `Token ${shortId(id)}`) : 'Tokens');
}
