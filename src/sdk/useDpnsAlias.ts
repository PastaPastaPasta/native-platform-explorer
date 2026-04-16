'use client';

import { useDpnsUsername, useDpnsIsContested } from './queries';

export interface DpnsAliasInfo {
  alias: string | undefined;
  loading: boolean;
  isContested: boolean;
}

/**
 * For an identity ID, return the primary DPNS alias (if any) plus a contested flag.
 * Deduplicated and cached via React Query — concurrent callers for the same id
 * share one fetch.
 */
export function useDpnsAlias(identityId: string | undefined): DpnsAliasInfo {
  const aliasQ = useDpnsUsername(identityId);
  const alias = (aliasQ.data as string | undefined) ?? undefined;
  const contestedQ = useDpnsIsContested(alias);
  return {
    alias,
    loading: aliasQ.isLoading || (!!alias && contestedQ.isLoading),
    isContested: (contestedQ.data as boolean | undefined) === true,
  };
}
