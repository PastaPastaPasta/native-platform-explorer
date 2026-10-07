import { walkInstance, safeStringify } from '@util/wasm-json';

/**
 * Pull a human-readable message out of an SDK error. The WASM SDK throws
 * objects like WasmSdkError / ConsensusError / WasmDppError that are NOT
 * Error instances and whose state (message, code, kind, name) lives behind
 * prototype getters. `String(err)` on them returns "[object Object]", which
 * is why the Query Inspector used to show that for failures. `walkInstance`
 * reads the getters; we then format the most useful fields into one line.
 */
export function extractErrorMessage(err: unknown): string {
  if (err === null || err === undefined) return String(err);
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err !== 'object') return String(err);
  try {
    const walked = walkInstance(err) as Record<string, unknown>;
    const ctorName = (err as { constructor?: { name?: string } }).constructor?.name;
    const name = typeof walked.name === 'string' ? walked.name : undefined;
    const kind = typeof walked.kind === 'string' ? walked.kind : undefined;
    const code =
      walked.code !== undefined && walked.code !== null ? String(walked.code) : undefined;
    const message = typeof walked.message === 'string' ? walked.message : undefined;

    const label = name ?? (ctorName && ctorName !== 'Object' ? ctorName : undefined);
    const tagParts: string[] = [];
    if (label) tagParts.push(label);
    if (kind && kind !== label) tagParts.push(`(${kind})`);
    if (code) tagParts.push(`[${code}]`);
    const tag = tagParts.join(' ');

    if (message) return tag ? `${tag}: ${message}` : message;
    const dump = safeStringify(walked, 0);
    if (dump && dump !== '{}') return tag ? `${tag}: ${dump}` : dump;
    if (tag) return tag;
  } catch {
    /* fall through */
  }
  return String(err);
}

/** Wrap a thrown value in a proper Error so React Query and consumers get
 *  a usable `.message`. Keeps the original on `.cause` for debugging. */
export function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  const wrapped = new Error(extractErrorMessage(err));
  (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}
