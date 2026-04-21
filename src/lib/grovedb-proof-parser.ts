/** Lazy-loading wrapper for the grovedb-proof-parser WASM module. */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let initPromise: Promise<typeof import('./grovedb-proof-parser/grovedb_proof_parser')> | null = null;

async function ensureLoaded() {
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import('./grovedb-proof-parser/grovedb_proof_parser');
      await mod.default();
      return mod;
    })();
  }
  return initPromise;
}

export async function parseGrovedbProof(bytes: Uint8Array): Promise<string> {
  const mod = await ensureLoaded();
  return mod.parse_grovedb_proof(bytes);
}
