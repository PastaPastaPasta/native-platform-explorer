import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src/components/query-inspector/__tests__/fixtures');

/** Real testnet DPNS proofs captured with the SDK's documents.queryWithProof
 *  (`domain`, normalizedParentDomainName == 'dash', limit 3): the raw bytes
 *  (`.bin`) and the bundled parser's output for them (`.txt`). */
export function proofText(name: 'testnet-dpns-domain-asc' | 'testnet-dpns-domain-desc'): string {
  return readFileSync(join(DIR, `${name}.txt`), 'utf8');
}

export function proofBytes(name: 'testnet-dpns-domain-asc' | 'testnet-dpns-domain-desc'): Uint8Array {
  return new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));
}

export function wasmBytes(): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'src/lib/grovedb-proof-parser/grovedb_proof_parser_bg.wasm')));
}
