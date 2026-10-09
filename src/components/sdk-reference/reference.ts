export interface ReferenceCall {
  method: string;
  kind: string;
  sources: { file: string; line: number; owner: string }[];
}

export interface ReferencePage {
  route: string;
  source: string;
  calls: ReferenceCall[];
}

/** Keep every call when matching a page; otherwise show only matching calls. */
export function filterReference(pages: ReferencePage[], query: string, route: string) {
  const term = query.trim().toLowerCase();
  return pages.flatMap((page) => {
    if (route && page.route !== route) return [];
    if (!term || page.route.toLowerCase().includes(term)) return [page];
    const calls = page.calls.filter((call) => `${call.method} ${call.kind} ${call.sources
      .map((source) => `${source.owner} ${source.file}`).join(' ')}`.toLowerCase().includes(term));
    return calls.length ? [{ ...page, calls }] : [];
  });
}
