/** Lazy-loading wrapper for the grovedb-proof-parser WASM module. */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type ParserModule = typeof import('./grovedb-proof-parser/grovedb_proof_parser');

let loading: Promise<ParserModule> | null = null;
/** Compiled module kept across re-instantiation after a trap. */
let compiled: WebAssembly.Module | undefined;

function ensureLoaded(): Promise<ParserModule> {
  if (!loading) {
    const attempt = (async () => {
      const mod = await import('./grovedb-proof-parser/grovedb_proof_parser');
      await mod.default(compiled ? { module_or_path: compiled } : undefined);
      return mod;
    })();
    // A failed load (offline, blocked fetch) must not be cached forever.
    attempt.catch(() => {
      if (loading === attempt) loading = null;
    });
    loading = attempt;
  }
  return loading;
}

/** A proof the parser could not decode, with a message fit for display. The
 *  parser's raw failure (a string or a WebAssembly trap) is kept as `cause`. */
export class ProofParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProofParseError';
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof WebAssembly.RuntimeError) {
    return 'These bytes are not a valid GroveDB proof: the parser hit an internal limit while decoding them.';
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (/UnexpectedEnd/.test(raw)) {
    return 'The bytes end before the proof does. They may be truncated or not a GroveDB proof.';
  }
  return `These bytes could not be decoded as a GroveDB proof (${raw.slice(0, 200)}).`;
}

export async function parseGrovedbProof(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) throw new ProofParseError('No proof bytes to parse.');
  let mod: ParserModule;
  try {
    mod = await ensureLoaded();
  } catch (error) {
    throw new ProofParseError('The proof parser could not be loaded. Check your connection and try again.', { cause: error });
  }
  try {
    return mod.parse_grovedb_proof(bytes);
  } catch (error) {
    if (error instanceof WebAssembly.RuntimeError) {
      // A trap may leave the instance inconsistent; start fresh next time.
      compiled = mod.__resetInstance() ?? compiled;
      loading = null;
    }
    throw new ProofParseError(describeFailure(error), { cause: error });
  }
}
