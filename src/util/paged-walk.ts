/** A Map built by a capped paginated walk. `truncated` is set when the page
 *  cap stopped the walk while pages were still full, so entries may be
 *  missing. Still a Map, so consumers that only read entries are unchanged. */
export class WalkedMap<K, V> extends Map<K, V> {
  truncated = false;
}

export function isTruncatedWalk(data: unknown): boolean {
  return data instanceof WalkedMap && data.truncated;
}
