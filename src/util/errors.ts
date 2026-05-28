/** Coerce an unknown thrown value into an Error suitable for UI props.
 *  Mirrors the trivial pattern used wherever a TanStack-Query `error` field
 *  needs to become an Error | null. */
export function toError(err: unknown): Error | null {
  if (err === null || err === undefined) return null;
  if (err instanceof Error) return err;
  return new Error(String(err));
}
