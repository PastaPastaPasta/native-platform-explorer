import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src/components/query-inspector/__tests__/fixtures');

/** Real testnet proofs: the raw bytes (`.bin`) and the bundled parser's
 *  output for them (`.txt`).
 *  - `testnet-dpns-domain-*`: SDK documents.queryWithProof on DPNS `domain`,
 *    normalizedParentDomainName == 'dash', limit 3, ascending / descending.
 *  - `testnet-release-range-sum`: SDK 5.0.0-rc.8 documents.sumWithProof
 *    against testnet Drive 5.0.0-rc.8, contract
 *    5ofyNoMo8YriuoEFW4aTt1vkhyecurXso1Yyif324rfV, type `release`, sum of
 *    `delta` over the rangeSummable `perTag` index where
 *    repoId == 4Gi9cEwBkN1iGUBGqKcewJhj2TfKy94TTTkLLbM4cc1R and
 *    tagName > 'a' (result 2). Its last layer is a ProvableSumTree with
 *    KVDigestSum and HashWithSum nodes. */
export type ProofFixture = 'testnet-dpns-domain-asc' | 'testnet-dpns-domain-desc' | 'testnet-release-range-sum';

export function proofText(name: ProofFixture): string {
  return readFileSync(join(DIR, `${name}.txt`), 'utf8');
}

export function proofBytes(name: ProofFixture): Uint8Array {
  return new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));
}

export function wasmBytes(): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'src/lib/grovedb-proof-parser/grovedb_proof_parser_bg.wasm')));
}
