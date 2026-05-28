#!/usr/bin/env node
// Showcase the new aggregate-query surface (count / sum / average +
// `groupBy`) against the grades contract on devnet-paloma.
//
// These are *only* the cool ones — every query here is a primitive that
// would have required full-table-scan + client-side reduce on the
// pre-3.1 SDK. Now they're O(log distinct-values) reads against the
// indexed SumTree / CountTree machinery.
//
// Usage:
//   node scripts/query-grades.mjs                      # run all
//   node scripts/query-grades.mjs --only=1,4,9         # run a subset
//
// The script talks to the raw wasm SDK methods (`getDocumentsCount` /
// `getDocumentsSum` / `getDocumentsAverage`) — `evo-sdk`'s `documents`
// facade only wraps the regular `query` path right now.

import { EvoSDK } from '@dashevo/evo-sdk';

const NETWORK = 'paloma';
const CONTRACT_ID = 'C2SZQvHzzQ8XXM47muPHt9dLrf64Sc2aSSdAiyPhDT2i';
const DOCUMENT_TYPE = 'grade';

const CLASSES = ['CS101', 'CS202', 'MATH150', 'MATH250', 'PHYS200', 'BIO110', 'ENG101'];

// ── tiny utility ──────────────────────────────────────────────────────────

function fmtMap(map) {
  if (!(map instanceof Map)) return String(map);
  if (map.size === 0) return '(empty)';
  return [...map.entries()]
    .map(([k, v]) => {
      if (v && typeof v === 'object' && 'count' in v && 'sum' in v) {
        const c = Number(v.count);
        const s = Number(v.sum);
        const avg = c === 0 ? '—' : (s / c).toFixed(2);
        return `  ${k || '(total)'} → count=${c} sum=${s} avg=${avg}`;
      }
      return `  ${k || '(total)'} → ${typeof v === 'bigint' ? v.toString() : v}`;
    })
    .join('\n');
}

function base(extra) {
  return {
    dataContractId: CONTRACT_ID,
    documentTypeName: DOCUMENT_TYPE,
    ...extra,
  };
}

// ── the cool queries ──────────────────────────────────────────────────────

const QUERIES = [
  {
    id: 1,
    title: 'GLOBAL COUNT — every grade ever recorded',
    why: 'documentsCountable on the doctype gives an O(1) read of the doctype primary tree.',
    run: async (w) => fmtMap(await w.getDocumentsCount(base({}))),
  },
  {
    id: 2,
    title: 'GLOBAL SUM(score) — total points awarded',
    why: 'documentsSummable: "score" puts the running total on the SumTree root — single read.',
    run: async (w) => fmtMap(await w.getDocumentsSum(base({}), 'score')),
  },
  {
    id: 3,
    title: 'GLOBAL AVG(score) — the school-wide GPA',
    why: 'AVG returns {count, sum}; we pair the doctype SumTree with its CountTree terminator.',
    run: async (w) => fmtMap(await w.getDocumentsAverage(base({}), 'score')),
  },
  {
    id: 4,
    title: 'AVG(score) WHERE class == "CS101" — CS101 GPA',
    why: 'byClass is summable: "score" — point lookup, O(log #classes).',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsAverage(
          base({ where: [['class', '==', 'CS101']] }),
          'score',
        ),
      ),
  },
  {
    id: 5,
    title: 'COUNT GROUP BY class — per-class enrollment fan-out',
    why: 'IN-fan-out on byClass; one entry per requested class, no scan.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsCount(
          base({
            where: [['class', 'in', CLASSES]],
            groupBy: ['class'],
          }),
        ),
      ),
  },
  {
    id: 6,
    title: 'AVG(score) GROUP BY class — per-class GPA leaderboard',
    why: 'Same IN-fan-out, but riding the byClass summable terminator. AVG per class with one round trip.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsAverage(
          base({
            where: [['class', 'in', CLASSES]],
            groupBy: ['class'],
          }),
          'score',
        ),
      ),
  },
  {
    id: 7,
    title: 'SUM(score) WHERE semester == 20251',
    why: 'bySemester is summable: "score" — point lookup on the bySemester SumTree.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsSum(
          base({ where: [['semester', '==', 20251]] }),
          'score',
        ),
      ),
  },
  {
    id: 8,
    title: 'COUNT WHERE class == "CS101" AND semester ∈ [20251, 20253] — range count',
    why: 'byClassSemester is rangeCountable — AggregateCountOnRange walks the ProvableCountTree once.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsCount(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20251],
              ['semester', '<=', 20253],
            ],
          }),
        ),
      ),
  },
  {
    id: 9,
    title: 'SUM(score) WHERE class == "CS101" AND semester ∈ [20251, 20253] — range sum',
    why: 'byClassSemester is rangeSummable — AggregateSumOnRange, single ProvableSumTree pass.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsSum(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20251],
              ['semester', '<=', 20253],
            ],
          }),
          'score',
        ),
      ),
  },
  {
    id: 10,
    title: 'AVG(score) WHERE class == "CS101" AND semester ∈ [20251, 20253] — rolling 3-semester GPA',
    why: 'Same range, but {count, sum} pair so the client gets the true window mean.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsAverage(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20251],
              ['semester', '<=', 20253],
            ],
          }),
          'score',
        ),
      ),
  },
  {
    id: 11,
    title: 'COUNT GROUP BY semester for class == "CS101" — histogram across time',
    why: 'RangeDistinct on byClassSemester: one entry per distinct semester in the window.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsCount(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20241],
              ['semester', '<=', 20262],
            ],
            orderBy: [['semester', 'asc']],
            groupBy: ['semester'],
          }),
        ),
      ),
  },
  {
    id: 12,
    title: 'AVG(score) GROUP BY semester for class == "CS101" — GPA trend per semester',
    why: 'RangeDistinct on the summable side — one {count, sum} per semester in the window.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsAverage(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20241],
              ['semester', '<=', 20262],
            ],
            orderBy: [['semester', 'asc']],
            groupBy: ['semester'],
          }),
          'score',
        ),
      ),
  },
  {
    id: 13,
    title: 'SUM(score) GROUP BY semester for class == "CS101" — cumulative class quality per term',
    why: 'Same RangeDistinct, sum-side only — useful when you care about total weight rather than the mean.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsSum(
          base({
            where: [
              ['class', '==', 'CS101'],
              ['semester', '>=', 20241],
              ['semester', '<=', 20262],
            ],
            orderBy: [['semester', 'asc']],
            groupBy: ['semester'],
          }),
          'score',
        ),
      ),
  },
  {
    id: 14,
    title: 'COUNT GROUP BY class WHERE class IN [...] AND semester ∈ [20251, 20262] — carrier-aggregate (IN + range)',
    why: 'Compound In+range with groupBy: ["class"] hits the carrier-aggregate primitive across multiple per-class byClassSemester walks. One call returns one entry per class.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsCount(
          base({
            where: [
              ['class', 'in', CLASSES],
              ['semester', '>=', 20251],
              ['semester', '<=', 20262],
            ],
            groupBy: ['class'],
          }),
        ),
      ),
  },
  {
    id: 15,
    title: 'SUM(score) GROUP BY class WHERE class IN [...] AND semester ∈ [20251, 20262] — points per class in window',
    why: 'Carrier-aggregate sum: one entry per class with the windowed score total.',
    run: async (w) =>
      fmtMap(
        await w.getDocumentsSum(
          base({
            where: [
              ['class', 'in', CLASSES],
              ['semester', '>=', 20251],
              ['semester', '<=', 20262],
            ],
            groupBy: ['class'],
          }),
          'score',
        ),
      ),
  },
];

// ── runner ────────────────────────────────────────────────────────────────

function parseOnly() {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return null;
  return new Set(
    arg.slice('--only='.length).split(',').map((s) => Number(s.trim())).filter(Number.isFinite),
  );
}

async function main() {
  const only = parseOnly();

  console.log(`[query-grades] connecting to devnet-${NETWORK} (trusted)…\n`);
  const sdk = EvoSDK.devnetTrusted(NETWORK);
  await sdk.connect();
  const w = await sdk.getWasmSdkConnected();

  for (const q of QUERIES) {
    if (only && !only.has(q.id)) continue;
    console.log(`── #${q.id}  ${q.title}`);
    console.log(`   why: ${q.why}`);
    const t0 = Date.now();
    try {
      const out = await q.run(w);
      const dt = Date.now() - t0;
      console.log(`${out}\n   (${dt} ms)\n`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.log(`   ✗ failed: ${msg}\n`);
    }
  }
}

main().catch((err) => {
  console.error('[query-grades] fatal:', err);
  process.exit(1);
});
