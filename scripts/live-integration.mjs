#!/usr/bin/env node

const network = process.env.NPE_LIVE_NETWORK || 'testnet';
const dpnsName = process.env.NPE_LIVE_DPNS_NAME || '';
const timeoutMs = Number(process.env.NPE_LIVE_TIMEOUT_MS || 60_000);

function withTimeout(label, promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createSdk(EvoSDK) {
  if (network === 'mainnet') return EvoSDK.mainnetTrusted();
  if (network === 'testnet') return EvoSDK.testnetTrusted();
  if (network.startsWith('devnet-')) {
    return EvoSDK.devnetTrusted(network.replace(/^devnet-/, ''));
  }
  throw new Error(`Unsupported NPE_LIVE_NETWORK "${network}"`);
}

function assertPresent(label, value) {
  if (value === null || value === undefined) {
    throw new Error(`${label} was empty`);
  }
}

const { EvoSDK } = await import('@dashevo/evo-sdk');
const sdk = createSdk(EvoSDK);

console.log(`[live] connecting to ${network}`);
await withTimeout('sdk.connect', sdk.connect());

const status = await withTimeout('system.status', sdk.system.status());
assertPresent('system.status', status);
console.log('[live] system.status ok');

const epoch = await withTimeout('epoch.current', sdk.epoch.current());
assertPresent('epoch.current', epoch);
console.log('[live] epoch.current ok');

const creditsWithProof = await withTimeout(
  'system.totalCreditsInPlatformWithProof',
  sdk.system.totalCreditsInPlatformWithProof(),
);
assertPresent('totalCreditsInPlatformWithProof.data', creditsWithProof?.data);
assertPresent('totalCreditsInPlatformWithProof.metadata', creditsWithProof?.metadata);
assertPresent('totalCreditsInPlatformWithProof.proof', creditsWithProof?.proof);
console.log('[live] proof metadata ok');

if (dpnsName) {
  const dpns = await withTimeout('dpns.resolveName', sdk.dpns.resolveName(dpnsName));
  assertPresent(`dpns.resolveName(${dpnsName})`, dpns);
  console.log(`[live] DPNS fixture ${dpnsName} ok`);
} else {
  console.log('[live] DPNS fixture skipped; set NPE_LIVE_DPNS_NAME to enable it');
}

console.log('[live] integration checks passed');
