#!/usr/bin/env node
// Seed synthetic `grade` documents into the grades contract on devnet-paloma
// so the new aggregate-query surface (count / sum / average + groupBy) has
// something to chew on.
//
// Usage:
//   node scripts/seed-grades.mjs                 # default: 200 docs
//   GRADES_COUNT=500 node scripts/seed-grades.mjs
//   GRADES_CONCURRENCY=4 node scripts/seed-grades.mjs
//
// The identity / contract / network are hard-coded — this is a throwaway
// seeding script for the contract registered at
//   C2SZQvHzzQ8XXM47muPHt9dLrf64Sc2aSSdAiyPhDT2i
// using the identity in `IDENTITY` below.
//
// The script is happy to be re-run: each document gets a fresh random ID
// (entropy-driven), so a second pass adds more rows rather than colliding.

import { EvoSDK, Document, IdentitySigner } from '@dashevo/evo-sdk';
import { randomBytes } from 'node:crypto';

// ── Hard-coded fixture ────────────────────────────────────────────────────
const NETWORK = 'paloma';
const CONTRACT_ID = 'C2SZQvHzzQ8XXM47muPHt9dLrf64Sc2aSSdAiyPhDT2i';
const DOCUMENT_TYPE = 'grade';
// Mirror of src/sdk/networks.ts DEVNET_PALOMA.dapiAddresses. Used to bypass
// the trusted-context quorum-cache machinery — broadcasts don't need proof
// verification, and the cache gets wedged when the chain quorum rotates.
const DAPI_ADDRESSES = [
  'https://68.67.122.198:1443',
  'https://68.67.122.199:1443',
  'https://68.67.122.86:1443',
  'https://68.67.122.197:1443',
  'https://68.67.122.192:1443',
  'https://68.67.122.85:1443',
  'https://68.67.122.88:1443',
  'https://68.67.122.206:1443',
  'https://68.67.122.193:1443',
  'https://68.67.122.195:1443',
  'https://68.67.122.196:1443',
  'https://68.67.122.87:1443',
  'https://68.67.122.207:1443',
];

const IDENTITY = {
  identityId: '8uT9KJ96JrFEYSoCMXbPHxRdnVYEyVUxMMVorD4cTtiS',
  keys: [
    // High-auth key is the right level for document writes.
    { id: 1, wif: 'cSANrUYLYu9bFXNs6oSgSDC7AXLQWQDjwvQHst2PxkP7QMz9zben' },
  ],
};

// Synthetic universe: small enough that aggregates produce
// nicely-clusterable numbers, large enough to be interesting.
const CLASSES = ['CS101', 'CS202', 'MATH150', 'MATH250', 'PHYS200', 'BIO110', 'ENG101'];
const SEMESTERS = [20241, 20242, 20251, 20252, 20253, 20261];
const STUDENT_POOL_SIZE = 40;   // distinct student byte-IDs reused across docs
const INSTRUCTOR_POOL_SIZE = 8; // distinct instructor byte-IDs

const TOTAL = Number(process.env.GRADES_COUNT ?? 200);
const CONCURRENCY = Number(process.env.GRADES_CONCURRENCY ?? 1);
// Devnet DAPI nodes are slow + flaky; we don't want one timeout to permanently
// ban an address for the rest of the run.
const SDK_SETTINGS = {
  banFailedAddress: false,
  timeoutMs: 60_000,
  retries: 5,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Score distribution skewed toward 60–95 with a long tail to either side,
// so averages and per-class buckets don't all collapse to ~50.
function rollScore() {
  const r = Math.random();
  if (r < 0.05) return Math.floor(Math.random() * 40);         // 0–39
  if (r < 0.85) return 60 + Math.floor(Math.random() * 36);    // 60–95
  return 96 + Math.floor(Math.random() * 5);                   // 96–100
}

const studentPool = Array.from({ length: STUDENT_POOL_SIZE }, () => randomBytes(32));
const instructorPool = Array.from({ length: INSTRUCTOR_POOL_SIZE }, () => randomBytes(32));

function buildProperties() {
  return {
    student: pick(studentPool),
    class: pick(CLASSES),
    semester: pick(SEMESTERS),
    score: rollScore(),
    instructor: pick(instructorPool),
  };
}

// ── SDK setup ─────────────────────────────────────────────────────────────

async function main() {
  let sdk;
  let identity;
  let identityKey;
  let signer; // wasm objects can't be constructed until after sdk.connect()
  const keyId = IDENTITY.keys[0].id;

  // Trusted-context devnet caches quorum pubkeys at connect time. When the
  // chain rotates to a new quorum, subsequent broadcasts fail with
  // "Quorum not found in cache for hash …" — the only fix is a fresh
  // prefetch (i.e. a new EvoSDK + connect()). `connectFresh` does that;
  // we call it on startup and again whenever a cache-miss error trips.
  async function connectFresh(reason) {
    console.log(`[seed-grades] (re)connecting trusted devnet-${NETWORK} — ${reason}`);
    sdk = EvoSDK.devnetTrusted(NETWORK, { settings: SDK_SETTINGS });
    await sdk.connect();
    identity = await sdk.identities.fetch(IDENTITY.identityId);
    if (!identity) throw new Error(`Identity ${IDENTITY.identityId} not found on devnet-${NETWORK}`);
    identityKey = identity.getPublicKeyById(keyId);
    if (!identityKey) throw new Error(`Identity has no public key with id ${keyId}`);
    void DAPI_ADDRESSES; // kept for reference; trusted-context discovers its own
  }
  await connectFresh('initial connect');
  signer = new IdentitySigner();
  signer.addKeyFromWif(IDENTITY.keys[0].wif);

  console.log(`[seed-grades] broadcasting ${TOTAL} docs with concurrency=${CONCURRENCY}…`);

  let completed = 0;
  let failed = 0;
  let reconnecting = null;
  const errors = [];

  async function broadcastOne(index) {
    const properties = buildProperties();
    const doc = new Document({
      properties,
      documentTypeName: DOCUMENT_TYPE,
      dataContractId: CONTRACT_ID,
      ownerId: IDENTITY.identityId,
      revision: 1n,
    });
    try {
      await sdk.documents.create({
        document: doc,
        identityKey,
        signer,
      });
      completed += 1;
      if (completed % 10 === 0 || completed === TOTAL) {
        console.log(
          `  ✓ ${completed}/${TOTAL} (last: ${properties.class} s=${properties.semester} score=${properties.score})`,
        );
      }
    } catch (err) {
      failed += 1;
      const msg = err && err.message ? err.message : String(err);
      errors.push(`#${index}: ${msg}`);
      console.warn(`  ✗ #${index} failed: ${msg}`);
      // Cache wedge → reconnect to re-prefetch quorums. Single-flight via
      // the cursor lock: only the first failing worker reconnects, others
      // wait on `reconnecting`.
      if (msg.includes('Quorum not found in cache')) {
        if (!reconnecting) {
          reconnecting = (async () => {
            try { await connectFresh(`quorum-cache wedge after #${index}`); }
            finally { reconnecting = null; }
          })();
        }
        try { await reconnecting; } catch { /* surfaced on next attempt */ }
      }
    } finally {
      try { doc.free?.(); } catch { /* noop */ }
    }
  }

  // Simple worker pool — keeps `CONCURRENCY` broadcasts in flight without
  // bursting the whole batch at once (nonce contention + DAPI rate-limits).
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= TOTAL) return;
      await broadcastOne(i);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  signer.free?.();

  console.log(`\n[seed-grades] done. ok=${completed} failed=${failed}`);
  if (errors.length > 0) {
    console.log('\nfirst few errors:');
    for (const e of errors.slice(0, 5)) console.log('  ' + e);
  }
}

main().catch((err) => {
  console.error('[seed-grades] fatal:', err);
  process.exit(1);
});
