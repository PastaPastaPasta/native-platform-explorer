import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sri } from './harden-export.mjs';

// Compare a local build with a deployment (see /about → Verify this build).
//
//   node scripts/verify-integrity.mjs https://explorer.dashhq.org/
//
// 1. Fetches the deployment's integrity.json and compares it with
//    out/integrity.json: commit, build settings and every file hash.
// 2. Downloads every file the local build has from the deployment and hashes
//    what the server actually returns, so a manifest that does not describe
//    the served files is caught too. --manifest-only skips this step.
// Exits 0 only if the deployment serves exactly the local build's files.

const USAGE = 'Usage: node scripts/verify-integrity.mjs [--out <dir>] [--manifest-only] <deployment URL>';

/** Differences between two integrity.json manifests. `problems` decide the
 *  outcome; `notes` explain likely causes (another commit, other settings). */
export function compareManifests(local, deployed) {
  const problems = [];
  const notes = [];
  if (local.commit !== deployed.commit) notes.push(`Commit differs: local ${local.commit}, deployed ${deployed.commit}. Rebuild at the deployed commit.`);
  if (local.dirty) notes.push('The local build has uncommitted changes.');
  if (local.basePath !== deployed.basePath) notes.push(`Base path differs: local "${local.basePath}", deployed "${deployed.basePath}". Set NEXT_PUBLIC_BASE_PATH to match.`);
  if (local.serviceWorker !== deployed.serviceWorker) notes.push(`Service worker differs: local ${local.serviceWorker}, deployed ${deployed.serviceWorker}.`);
  const names = new Set([...Object.keys(local.env ?? {}), ...Object.keys(deployed.env ?? {})]);
  for (const name of [...names].sort()) {
    const [mine, theirs] = [local.env?.[name], deployed.env?.[name]];
    if (mine !== theirs) notes.push(`${name} differs: local ${JSON.stringify(mine ?? null)}, deployed ${JSON.stringify(theirs ?? null)}.`);
  }
  for (const key of ['node', 'packageManager', 'next', 'evoSdk']) {
    const [mine, theirs] = [local.toolchain?.[key], deployed.toolchain?.[key]];
    if (mine !== theirs) notes.push(`Toolchain ${key} differs: local ${mine}, deployed ${theirs}.`);
  }
  for (const [file, hash] of Object.entries(local.files)) {
    if (!(file in deployed.files)) problems.push(`Missing from the deployment: ${file}`);
    else if (deployed.files[file] !== hash) problems.push(`Hash differs: ${file}`);
  }
  for (const file of Object.keys(deployed.files)) {
    if (!(file in local.files)) problems.push(`Only in the deployment: ${file}`);
  }
  return { problems, notes };
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Hash what the deployment serves for each of the local build's files. */
export async function checkServedFiles(baseUrl, files, { concurrency = 8, fetcher = fetchBytes } = {}) {
  const problems = [];
  // .nojekyll only switches off Jekyll on GitHub Pages, which does not serve it.
  const queue = Object.entries(files).filter(([file]) => !file.startsWith('.'));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [file, hash] = next;
      try {
        const served = sri(await fetcher(new URL(file.split('/').map(encodeURIComponent).join('/'), baseUrl).href));
        if (served !== hash) problems.push(`Served file differs: ${file}`);
      } catch (error) {
        problems.push(`Could not download ${file}: ${error.message}`);
      }
    }
  }));
  return problems.sort();
}

async function main(args) {
  let outDir = 'out';
  let manifestOnly = false;
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--out') outDir = args[++index];
    else if (args[index] === '--manifest-only') manifestOnly = true;
    else positional.push(args[index]);
  }
  if (positional.length !== 1 || !outDir) {
    console.error(USAGE);
    return 2;
  }
  const baseUrl = positional[0].endsWith('/') ? positional[0] : `${positional[0]}/`;
  const local = JSON.parse(readFileSync(path.join(outDir, 'integrity.json'), 'utf8'));
  const deployed = JSON.parse((await fetchBytes(new URL('integrity.json', baseUrl).href)).toString('utf8'));
  console.log(`Local build:  commit ${local.commit}, ${Object.keys(local.files).length} files`);
  console.log(`Deployment:   commit ${deployed.commit}, ${Object.keys(deployed.files).length} files (${baseUrl})`);
  const { problems, notes } = compareManifests(local, deployed);
  if (!manifestOnly) problems.push(...await checkServedFiles(baseUrl, local.files));
  for (const note of notes) console.log(`note: ${note}`);
  for (const problem of problems) console.log(`FAIL: ${problem}`);
  console.log(problems.length === 0
    ? `OK: the deployment ${manifestOnly ? 'manifest matches' : 'serves'} exactly this build's files.`
    : `${problems.length} difference(s).`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
