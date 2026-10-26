import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proofBytes, proofText, wasmBytes } from '@components/query-inspector/__tests__/proof-fixtures';
import type * as Glue from '@/lib/grovedb-proof-parser/grovedb_proof_parser';

// The browser build fetches the .wasm next to the glue; tests hand the real
// module bytes to the same init function instead.
const init = vi.hoisted(() => ({ calls: [] as unknown[], failNext: 0 }));
vi.mock('@/lib/grovedb-proof-parser/grovedb_proof_parser', async (importOriginal) => {
  const real = await importOriginal<typeof Glue>();
  return {
    ...real,
    default: async (options?: { module_or_path: unknown }) => {
      init.calls.push(options?.module_or_path);
      if (init.failNext > 0) {
        init.failNext--;
        throw new TypeError('Failed to fetch');
      }
      return real.default({ module_or_path: (options?.module_or_path ?? wasmBytes()) as BufferSource });
    },
  };
});

async function freshParser() {
  vi.resetModules();
  init.calls = [];
  return import('@/lib/grovedb-proof-parser');
}

describe('parseGrovedbProof', () => {
  beforeEach(() => {
    init.failNext = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('parses real testnet proof bytes', async () => {
    const { parseGrovedbProof } = await freshParser();
    const text = await parseGrovedbProof(proofBytes('testnet-dpns-domain-desc'));
    expect(text.trim()).toBe(proofText('testnet-dpns-domain-desc').trim());
  });

  it('normalizes parser failures to friendly errors', async () => {
    const { parseGrovedbProof, ProofParseError } = await freshParser();
    await expect(parseGrovedbProof(new Uint8Array())).rejects.toThrow('No proof bytes to parse.');
    const truncated = parseGrovedbProof(proofBytes('testnet-dpns-domain-asc').slice(0, 100));
    await expect(truncated).rejects.toBeInstanceOf(ProofParseError);
    await expect(truncated).rejects.toThrow(/end before the proof does/);
    await expect(truncated).rejects.toHaveProperty('cause', expect.stringContaining('UnexpectedEnd'));
  });

  it('re-instantiates the module after a trap and keeps working', async () => {
    const { parseGrovedbProof } = await freshParser();
    const good = proofBytes('testnet-dpns-domain-asc');
    await parseGrovedbProof(good);
    expect(init.calls).toHaveLength(1);

    const trap = parseGrovedbProof(new Uint8Array([0, 0xfc, 0xff, 0xff, 0xff, 0xff]));
    await expect(trap).rejects.toThrow(/not a valid GroveDB proof/);
    await expect(trap).rejects.toHaveProperty('cause', expect.any(WebAssembly.RuntimeError));

    await expect(parseGrovedbProof(good)).resolves.toContain('GroveDBProofV1');
    expect(init.calls).toHaveLength(2);
    // The second instance reuses the compiled module rather than refetching.
    expect(init.calls[1]).toBeInstanceOf(WebAssembly.Module);
  });

  it('lets a parse queued behind a trapping one use the replacement instance', async () => {
    const { parseGrovedbProof } = await freshParser();
    const good = proofBytes('testnet-dpns-domain-desc');
    const [trapped, queued] = await Promise.allSettled([
      parseGrovedbProof(new Uint8Array([0, 0xfc, 0xff, 0xff, 0xff, 0xff])),
      parseGrovedbProof(good),
    ]);
    expect(trapped).toMatchObject({ status: 'rejected', reason: { name: 'ProofParseError' } });
    expect(queued).toMatchObject({ status: 'fulfilled', value: expect.stringContaining('PushInverted') });
    expect(init.calls).toHaveLength(2);
  });

  it('retries loading after a failed initialization', async () => {
    const { parseGrovedbProof } = await freshParser();
    init.failNext = 1;
    await expect(parseGrovedbProof(new Uint8Array([1]))).rejects.toThrow('The proof parser could not be loaded.');
    await expect(parseGrovedbProof(proofBytes('testnet-dpns-domain-asc'))).resolves.toContain('LayerProof');
    expect(init.calls).toHaveLength(2);
  });
});
