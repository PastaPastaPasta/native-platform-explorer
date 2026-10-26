import { createParser, parseAsArrayOf, parseAsStringLiteral } from 'nuqs';
import { isEpochIndex } from '@sdk/epoch-queries';
import { isBase58Identifier } from './identifier';

// Parsers for list views whose filters and paging live in the URL (PRD §11.3).
// Invalid values parse to null, so a hand-edited link falls back to defaults
// instead of failing the page.

/** A whole epoch index (0 … MAX_EPOCH_INDEX). */
export const epochIndexParser = createParser({
  parse: (value: string) => (/^\d{1,5}$/.test(value) && isEpochIndex(Number(value)) ? Number(value) : null),
  serialize: (value: number) => String(value),
});

export const DEFAULT_EPOCH_SPAN = 20;

/** Resolve the shown range: `?to` defaults to the current epoch and `?from`
 *  to the 20 epochs ending at `to`. */
export function resolveEpochRange(
  url: { from: number | null; to: number | null },
  currentIdx: number | undefined,
): { from: number | undefined; to: number | undefined } {
  const to = url.to ?? currentIdx;
  const from = url.from ?? (to === undefined ? undefined : Math.max(0, to - (DEFAULT_EPOCH_SPAN - 1)));
  return { from, to };
}

/** 1-based page number for client-side paged lists. */
export const MAX_PAGE = 10_000;
export const pageParser = createParser({
  parse: (value: string) => {
    if (!/^\d{1,5}$/.test(value)) return null;
    const page = Number(value);
    return page >= 1 && page <= MAX_PAGE ? page : null;
  },
  serialize: (value: number) => String(value),
});

/** A calendar date as `YYYY-MM-DD` (kept as a string: the poll window is
 *  interpreted in the visitor's time zone after hydration). */
export const isoDayParser = createParser({
  parse: (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
  },
  serialize: (value: string) => value,
});

export const POLL_WINDOWS = ['24h', '7d', '30d', '90d', 'all-upcoming', 'custom'] as const;
export type PollWindow = (typeof POLL_WINDOWS)[number];
export const pollWindowParser = parseAsStringLiteral(POLL_WINDOWS);

/** Cursor stack for `startAfter` paging: the document ID after which each
 *  page past the first starts. Its length is the 0-based page index. */
export const MAX_CURSOR_PAGES = 100;
export const cursorStackParser = parseAsArrayOf(
  createParser({
    parse: (value: string) => (isBase58Identifier(value) ? value : null),
    serialize: (value: string) => value,
  }),
).withDefault([]);

/** Parse a cursor-stack param, dropping it entirely when any cursor is invalid
 *  or the stack is implausibly deep. */
export function sanitizeCursorStack(stack: readonly string[]): string[] {
  return stack.length > MAX_CURSOR_PAGES ? [] : [...stack];
}

export const SAVED_SCOPES = ['current', 'all'] as const;
export const SAVED_KINDS = ['all', 'identity', 'contract', 'token'] as const;
export const savedScopeParser = parseAsStringLiteral(SAVED_SCOPES).withDefault('current');
export const savedKindParser = parseAsStringLiteral(SAVED_KINDS).withDefault('all');
