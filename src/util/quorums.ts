import { toPlain } from './contract';
import { readProp } from './sdk-shape';

export interface QuorumRow {
  quorumHash: string;
  /** Inferred by the pinned SDK from the member count (50–70 → LLMQ_60_75,
   *  90–110 → LLMQ_100_67, 350–450 → LLMQ_400_60, otherwise
   *  LLMQ_TYPE_UNKNOWN, e.g. testnet's 25-member quorums); Platform does not
   *  report it. */
  quorumType: string;
  memberCount: number | null;
  /** Inferred alongside the type: a fraction of the member count, not the
   *  LLMQ type's configured threshold. */
  threshold: number | null;
}

export interface QuorumsSummary {
  height: bigint | null;
  quorums: QuorumRow[];
}

function num(x: unknown): number | null {
  const n = typeof x === 'bigint' ? Number(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

function row(q: unknown): QuorumRow | null {
  const plain = (toPlain(q) as Record<string, unknown> | undefined) ?? {};
  const pick = (key: string) => readProp<unknown>(q, key) ?? plain[key];
  const hash = pick('quorumHash');
  if (typeof hash !== 'string' || !hash) return null;
  const type = pick('quorumType');
  return {
    quorumHash: hash,
    quorumType: typeof type === 'string' && type ? type : 'unknown',
    memberCount: num(pick('memberCount')),
    threshold: num(pick('threshold')),
  };
}

/** Normalises `system.currentQuorumsInfo()` (a native CurrentQuorumsInfo or
 *  its JSON form) into display rows. */
export function normaliseQuorums(raw: unknown): QuorumsSummary {
  const list = readProp<unknown>(raw, 'quorums');
  const height = readProp<unknown>(raw, 'height');
  return {
    height:
      typeof height === 'bigint' ? height
        : typeof height === 'number' && Number.isSafeInteger(height) ? BigInt(height)
          : typeof height === 'string' && /^\d+$/.test(height) ? BigInt(height)
            : null,
    quorums: Array.isArray(list)
      ? list.map(row).filter((r): r is QuorumRow => r !== null)
      : [],
  };
}

export interface QuorumGroup {
  quorumType: string;
  memberCount: number | null;
  threshold: number | null;
  count: number;
}

/** Quorums grouped by reported type, size and threshold, largest group first. */
export function quorumBreakdown(rows: QuorumRow[]): QuorumGroup[] {
  const groups = new Map<string, QuorumGroup>();
  for (const r of rows) {
    const key = `${r.quorumType}|${r.memberCount}|${r.threshold}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { quorumType: r.quorumType, memberCount: r.memberCount, threshold: r.threshold, count: 1 });
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || (b.memberCount ?? 0) - (a.memberCount ?? 0),
  );
}
