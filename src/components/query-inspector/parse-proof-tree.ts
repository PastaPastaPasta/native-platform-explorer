/**
 * Parse the grovedb-proof-parser text output into a structured tree.
 *
 * Each LayerProof becomes a `ParsedLayer` with its ops captured in order and
 * its nested `lower_layers` linked as `children`. The renderer can then walk
 * the structure and show each subtree where it belongs.
 *
 * The parser prints two layouts (grovedb/src/operations/proof/mod.rs):
 *
 *   GroveDBProofV0                     GroveDBProofV1
 *     LayerProof {                       LayerProof {
 *       merk_proof:                        proof: Merk(
 *         0: Push(KV(...))                   0: Push(KV(...))
 *         1: Parent                          1: Parent)
 *
 * In V1 the `)` closing `Merk(` lands on the last op line, so op bodies are
 * re-balanced before matching. Everything here is iterative: proofs come from
 * the network and may be arbitrarily deep or malformed.
 */

import { decodeGroveKey, type DecodedKey, type GroveContext } from './grovedb-schema';

export type OpKind =
  | 'kv'              // Push(KV(key, value)) / KVCount / KVSum / KVCountSum — data item proven by the query
  | 'kvValueHash'     // Push(KVValueHash(key, value, HASH)) and the FeatureType variants
  | 'kvRefValueHash'  // Push(KVRefValueHash(key, value, HASH)) and its Count/Sum forms — reference resolved to its value
  | 'kvDigest'        // Push(KVDigest(key, HASH)) and its Count/Sum forms — sibling (value omitted)
  | 'kvHash'          // Push(KVHash(HASH)) and its Count/Sum forms — sibling
  | 'hash'            // Push(Hash(HASH)) and HashWithCount/Sum/CountAndSum — deep sibling
  | 'combine';        // Parent / Child stack-combine op

export interface OpNode {
  kind: OpKind;
  /** Op index printed by the parser (the `0:`, `1:`, ... prefix in raw text). */
  index: number;
  /** Original raw line, for fallback display. */
  raw: string;
  /** Merk node variant as printed, e.g. `KVValueHashFeatureTypeWithChildHash`. */
  variant?: string;
  /** True for `PushInverted(...)` (descending proofs). */
  inverted?: boolean;
  /** For KV* ops, the key as the parser emitted it (printable text or `0x..` hex). */
  key?: string;
  /** For KV / KVRefValueHash ops, the value text (e.g. "Item(0x0b)"). */
  value?: string;
  /** For KVValueHash* ops, the element descriptor (e.g. "Tree(01)", "SumTree(04e9, 12345)"). */
  treeValue?: string;
  /** True when the op's element is a tree, i.e. it opens a nested layer. */
  isTree?: boolean;
  /** For ops carrying a hash, the 32-byte hash as hex. For HashWith* nodes
   *  this is the node's kv_hash; the node hash is derived from it. */
  hash?: string;
  /** Count committed by a provable count tree node (`KVCount`, `KVHashCount`,
   *  `HashWithCount`, the *CountSum forms, …), as printed (a u64). */
  count?: string;
  /** Sum committed by a provable sum tree node (`KVSum`, `KVDigestSum`,
   *  `HashWithSum`, the *CountSum forms, …), as printed (an i64). */
  sum?: string;
  /** For combine ops, which kind. */
  combine?: 'Parent' | 'Child' | 'ParentInverted' | 'ChildInverted';
}

export interface ParsedLayer {
  /** 1-indexed layer number, assigned in depth-first order. */
  layerIndex: number;
  /** Nesting depth; the root layer is 0. */
  depth: number;
  /** Raw key that opened this layer (matches a key in the parent's `lower_layers`). Empty for root. */
  parentKey: string;
  /** Semantic decoding of `parentKey`. */
  decodedParentKey?: DecodedKey;
  /** GroveDB context for THIS layer (root | identity | tokens | ...). */
  context: GroveContext;
  /** Proof encoding of this layer when it is not a Merk proof (e.g. `MMR`). */
  proofKind?: string;
  /** All ops in order. */
  ops: OpNode[];
  /** Op lines the parser printed but we could not interpret. */
  issues: string[];
  /** Nested layers, keyed by the raw key that opens them. */
  children: Map<string, ParsedLayer>;
}

/** A node in the reconstructed binary merkle tree. */
export interface TreeNode {
  /** Source op that produced this node; every node comes from a Push op. */
  op: OpNode;
  kind: 'kv' | 'subtree' | 'sibling';
  left?: TreeNode;
  right?: TreeNode;
}

export interface LayerTree {
  /** The layer's root, or null when no node could be reconstructed. */
  root: TreeNode | null;
  /** Reasons the reconstruction is incomplete; empty for a well-formed layer. */
  issues: string[];
}

type CombineOp = NonNullable<OpNode['combine']>;

/**
 * Combine semantics from merk/src/proofs/tree.rs. For each op, identify which
 * of the two popped nodes is the parent (top vs below) and which slot the
 * other one fills (left vs right).
 */
const COMBINE_RULES: Record<CombineOp, { topIsParent: boolean; childGoesLeft: boolean }> = {
  Parent:         { topIsParent: true,  childGoesLeft: true  },
  Child:          { topIsParent: false, childGoesLeft: false },
  ParentInverted: { topIsParent: true,  childGoesLeft: false },
  ChildInverted:  { topIsParent: false, childGoesLeft: true  },
};

/** Element descriptors that open a nested subtree (Tree, SumTree, CountTree,
 *  MmrTree, PrivateDocumentStore, …), including the NonCounted / NotSummed /
 *  NotCountedOrSummed wrappers Drive 5 puts around aggregate-index subtrees. */
const TREE_ELEMENT = /^(?:(?:NonCounted|NotSummed|NotCountedOrSummed)\()*(?:\w*Tree|PrivateDocumentStore)\(/;

/** A tree element is a subtree only when the proof descends into it; a tree
 *  element without a lower layer is itself the result (e.g. a count tree). */
function leafKind(op: OpNode, children: ParsedLayer['children']): TreeNode['kind'] {
  if (op.kind === 'kv' || op.kind === 'kvRefValueHash') return 'kv';
  if (op.kind === 'kvValueHash') return op.isTree && op.key !== undefined && children.has(op.key) ? 'subtree' : 'kv';
  return 'sibling';
}

/**
 * Reconstruct the binary merkle tree by replaying the layer's stack operations.
 * A well-formed proof leaves exactly one node on the stack — the layer's root.
 * Anything else (underflow, a filled child slot, leftovers, unreadable ops) is
 * reported in `issues`; merk's verifier would reject such a proof outright.
 */
export function buildLayerTree(layer: ParsedLayer): LayerTree {
  const issues = [...layer.issues];
  const stack: TreeNode[] = [];
  for (const op of layer.ops) {
    if (op.kind !== 'combine') {
      stack.push({ op, kind: leafKind(op, layer.children) });
      continue;
    }
    if (!op.combine) continue;
    if (stack.length < 2) {
      issues.push(`Op ${op.index} (${op.combine}) needs two nodes but the stack holds ${stack.length}.`);
      continue;
    }
    const top = stack.pop()!;
    const below = stack.pop()!;
    const rule = COMBINE_RULES[op.combine];
    const parent = rule.topIsParent ? top : below;
    const child = rule.topIsParent ? below : top;
    const slot = rule.childGoesLeft ? 'left' : 'right';
    if (parent[slot]) {
      // Merk rejects attaching to an occupied slot; keep the first child.
      issues.push(`Op ${op.index} (${op.combine}) attaches a ${slot} child to op ${parent.op.index}, which already has one.`);
    } else {
      parent[slot] = child;
    }
    stack.push(parent);
  }
  if (stack.length > 1) {
    issues.push(`${stack.length} nodes were never combined into one tree; showing the last one.`);
  }
  if (layer.ops.length === 0 && !layer.proofKind) issues.push('This layer has no ops.');
  return { root: stack[stack.length - 1] ?? null, issues };
}

/**
 * Top-level parse. Returns null if no LayerProof was found.
 */
export function parseProofTree(text: string): ParsedLayer | null {
  // Strip CR so Windows line endings don't leak into op bodies.
  const lines = text.replace(/\r/g, '').split('\n');

  // Each frame is either an open layer or a non-layer brace block
  // (`lower_layers: {`, `<key> => {`, the outer wrapper, etc.). Brace tracking
  // is symmetric — every `{` opens a frame, every `}` pops one.
  const blockStack: Array<{ layer?: ParsedLayer }> = [];
  const openLayers: ParsedLayer[] = [];
  let root: ParsedLayer | null = null;
  let nextParentKey = '';
  let layerCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('LayerProof {')) {
      const parent = openLayers[openLayers.length - 1];
      const decoded = parent ? decodeGroveKey(nextParentKey, parent.context) : undefined;
      const context: GroveContext = decoded ? (decoded.nextContext ?? 'unknown') : 'root';
      const layer: ParsedLayer = {
        layerIndex: ++layerCount,
        depth: openLayers.length,
        parentKey: nextParentKey,
        decodedParentKey: decoded,
        context,
        ops: [],
        issues: [],
        children: new Map(),
      };
      if (!root) root = layer;
      if (parent) parent.children.set(nextParentKey, layer);
      blockStack.push({ layer });
      openLayers.push(layer);
      nextParentKey = '';
      continue;
    }

    if (line === '}') {
      if (blockStack.pop()?.layer) openLayers.pop();
      continue;
    }

    // Keys never contain whitespace or `=>`; an empty key prints as nothing.
    const childMatch = line.match(/^(\S*)\s*=>\s*\{$/);
    if (childMatch) {
      nextParentKey = childMatch[1] ?? '';
      blockStack.push({});
      continue;
    }

    if (line.endsWith('{')) {
      blockStack.push({});
      continue;
    }

    const cur = openLayers[openLayers.length - 1];
    if (!cur) continue;

    const proofKind = line.match(/^proof:\s*(\w+)\(/)?.[1];
    if (proofKind) {
      if (proofKind !== 'Merk') cur.proofKind = proofKind;
      continue;
    }

    const parsed = parseOpLine(line);
    if (!parsed) continue;
    if (parsed.issue) cur.issues.push(parsed.issue);
    if (parsed.op) cur.ops.push(parsed.op);
  }

  return root;
}

/** Depth-first (pre-order) list of every layer, without recursion. */
export function flattenLayers(root: ParsedLayer): ParsedLayer[] {
  const out: ParsedLayer[] = [];
  const pending: ParsedLayer[] = [root];
  while (pending.length) {
    const layer = pending.pop()!;
    out.push(layer);
    const children = Array.from(layer.children.values());
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]!);
  }
  return out;
}

/** Remove `)` characters that close an enclosing `Merk(` on the last op line. */
function balanceTrailingParens(body: string): string {
  let depth = 0;
  for (const c of body) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
  }
  let out = body;
  while (depth < 0 && out.endsWith(')')) {
    out = out.slice(0, -1).trimEnd();
    depth++;
  }
  return out;
}

/**
 * Parse a single op line. Returns null for lines that aren't ops (headers,
 * blank lines). Otherwise returns the op and/or an issue: every Push pushes
 * exactly one node, so an unreadable Push still yields an opaque node to keep
 * the stack in sync; other unreadable lines have no known stack effect.
 */
function parseOpLine(line: string): { op?: OpNode; issue?: string } | null {
  // Lines look like: `0: Push(KV(0xabc..., Item(0x0b)))` or `2: Parent`.
  const prefixMatch = line.match(/^(\d+):\s*(.*)$/);
  if (!prefixMatch) return null;
  const index = Number(prefixMatch[1]);
  const body = balanceTrailingParens(prefixMatch[2]!.trim());

  if (body === 'Parent' || body === 'Child' || body === 'ParentInverted' || body === 'ChildInverted') {
    return { op: { kind: 'combine', index, raw: line, combine: body } };
  }

  const pushMatch = body.match(/^(Push|PushInverted)\((\w+)\((.*)\)\)$/);
  if (!pushMatch) {
    if (body.startsWith('Error decoding op')) return { issue: `Op ${index}: the parser stopped (${body}).` };
    return { issue: `Op ${index} is not a recognized Merk op: ${body.slice(0, 120)}` };
  }
  const [, push, variant, inner] = pushMatch as unknown as [string, string, string, string];
  const base = { index, raw: line, variant, ...(push === 'PushInverted' ? { inverted: true } : {}) };

  // Reference: grovedb-query/src/proofs/mod.rs `enum Node`, as printed by
  // node_to_string in grovedb/src/operations/proof/mod.rs. Provable count and
  // sum trees add *Count / *Sum / *CountSum forms of the base variants that
  // also carry the node's aggregate; it is split off here and otherwise the
  // node is read like its base variant. Every variant pushes exactly one node.
  // `variant` is any \w+ the parser printed, so skip inherited keys like `constructor`.
  const shape = Object.hasOwn(NODE_SHAPES, variant) ? NODE_SHAPES[variant] : undefined;
  if (!shape) {
    return {
      op: { ...base, kind: 'hash' },
      issue: `Op ${index} uses the unrecognized node variant ${variant}; it is drawn as an opaque sibling.`,
    };
  }
  const parsed = parseNode(shape, inner);
  if (parsed) return { op: { ...base, ...parsed } };
  return {
    op: { ...base, kind: 'hash' },
    issue: `Op ${index} (${variant}) has an unexpected shape and is drawn as an opaque sibling: ${body.slice(0, 120)}`,
  };
}

/** How a node variant prints: its base form plus the aggregates it carries. */
interface NodeShape {
  base: 'kv' | 'kvValueHash' | 'kvRefValueHash' | 'kvDigest' | 'kvHash' | 'hash' | 'hashWith';
  count?: boolean;
  sum?: boolean;
}

const NODE_SHAPES: Record<string, NodeShape> = {
  KV: { base: 'kv' },
  KVCount: { base: 'kv', count: true },
  KVSum: { base: 'kv', sum: true },
  KVCountSum: { base: 'kv', count: true, sum: true },
  // A backward-references item: its value plus the hash of the referrer list.
  KVBackwardsReferencesValueHash: { base: 'kvRefValueHash' },
  KVValueHash: { base: 'kvValueHash' },
  KVValueHashFeatureType: { base: 'kvValueHash' },
  KVValueHashFeatureTypeWithChildHash: { base: 'kvValueHash' },
  KVRefValueHash: { base: 'kvRefValueHash' },
  KVRefValueHashCount: { base: 'kvRefValueHash', count: true },
  KVRefValueHashSum: { base: 'kvRefValueHash', sum: true },
  KVRefValueHashCountSum: { base: 'kvRefValueHash', count: true, sum: true },
  KVDigest: { base: 'kvDigest' },
  KVDigestCount: { base: 'kvDigest', count: true },
  KVDigestSum: { base: 'kvDigest', sum: true },
  KVDigestCountSum: { base: 'kvDigest', count: true, sum: true },
  KVHash: { base: 'kvHash' },
  KVHashCount: { base: 'kvHash', count: true },
  KVHashSum: { base: 'kvHash', sum: true },
  KVHashCountSum: { base: 'kvHash', count: true, sum: true },
  Hash: { base: 'hash' },
  // A whole subtree compressed to its root: kv_hash, child hashes, aggregate.
  HashWithCount: { base: 'hashWith', count: true },
  HashWithSum: { base: 'hashWith', sum: true },
  HashWithCountAndSum: { base: 'hashWith', count: true, sum: true },
};

type ParsedNode = Omit<OpNode, 'index' | 'raw' | 'variant' | 'inverted'>;

/**
 * Remove the trailing aggregate args. Single-aggregate variants print a bare
 * number (`KVSum(k, v, 5)`); the CountSum and HashWith* forms print
 * `count=N` / `sum=N`. Returns null when the args don't end that way.
 */
function takeAggregates(shape: NodeShape, parts: string[]): { rest: string[]; count?: string; sum?: string } | null {
  const names = [...(shape.count ? ['count'] : []), ...(shape.sum ? ['sum'] : [])];
  if (parts.length < names.length) return null;
  const rest = parts.slice(0, parts.length - names.length);
  const tail = parts.slice(parts.length - names.length);
  const out: { rest: string[]; count?: string; sum?: string } = { rest };
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const m = tail[i]!.match(/^(?:(count|sum)=)?(-?\d+)$/);
    if (!m || (m[1] !== undefined && m[1] !== name) || (m[1] === undefined && names.length > 1)) return null;
    out[name as 'count' | 'sum'] = m[2]!;
  }
  return out;
}

/** ` (count=N)`, ` (sum=N)` or ` (count=N, sum=M)`, appended to printed values. */
function aggregateSuffix(agg: { count?: string; sum?: string }): string {
  const parts = [
    ...(agg.count !== undefined ? [`count=${agg.count}`] : []),
    ...(agg.sum !== undefined ? [`sum=${agg.sum}`] : []),
  ];
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function parseNode(shape: NodeShape, inner: string): ParsedNode | null {
  const keyed = shape.base !== 'kvHash' && shape.base !== 'hash' && shape.base !== 'hashWith';
  const [key, rest] = keyed ? splitKey(inner) : [undefined, inner];
  const agg = takeAggregates(shape, splitTopLevelArgs(rest));
  if (!agg) return null;
  const { rest: parts, ...aggregates } = agg;
  const suffix = aggregateSuffix(aggregates);
  switch (shape.base) {
    case 'kv':
      if (parts.length < 1) return null;
      return { kind: 'kv', key, value: parts.join(', ') + suffix, ...aggregates };
    case 'kvRefValueHash':
      if (parts.length < 2) return null;
      return { kind: 'kvRefValueHash', key, value: parts[0]! + suffix, hash: extractHash(parts[1]!), ...aggregates };
    case 'kvValueHash': {
      if (parts.length < 2) return null;
      const element = parts[0]!;
      // The FeatureType forms print the node's tree feature type third,
      // e.g. `ProvableSummedMerkNode(12)`.
      const feature = parts[2] ? ` ${parts[2]}` : '';
      return {
        kind: 'kvValueHash',
        key,
        treeValue: element + feature,
        isTree: TREE_ELEMENT.test(element),
        hash: extractHash(parts[1]!),
      };
    }
    case 'kvDigest':
      return { kind: 'kvDigest', key, hash: extractHash(parts.join(', ')), ...aggregates };
    case 'kvHash':
    case 'hash':
      return { kind: shape.base, hash: extractHash(parts.join(', ')), ...aggregates };
    case 'hashWith': {
      // `kv_hash=HASH[..], left=HASH[..], right=HASH[..]`
      const kvHash = parts.find((p) => p.startsWith('kv_hash='));
      if (parts.length !== 3 || !kvHash) return null;
      return { kind: 'hash', hash: extractHash(kvHash), ...aggregates };
    }
  }
}

function extractHash(s: string): string | undefined {
  return s.match(/HASH\[([0-9a-fA-F]+)\]/)?.[1];
}

/**
 * Keys print as `0x…` hex or as text drawn from `[A-Za-z0-9_\-/\\[\]@]`
 * (grovedb-query `hex_to_ascii`) — never containing a comma — so the key is
 * everything before the first comma. Splitting it off first keeps `[`/`]`
 * inside keys from upsetting the bracket-depth tracking below.
 */
function splitKey(inner: string): [string, string] {
  const comma = inner.indexOf(',');
  if (comma === -1) return [inner.trim(), ''];
  return [inner.slice(0, comma).trim(), inner.slice(comma + 1).trim()];
}

/** Split top-level comma-separated args in a single linear pass. Only
 *  parentheses nest: bracketed lists (`flags: [..]`, `HASH[..]`) only appear
 *  inside them, while printed text such as `Item([abc)` may hold a lone `[`. */
function splitTopLevelArgs(s: string): string[] {
  if (!s) return [];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

export interface ProofLayerSummary {
  layer: ParsedLayer;
  /** Data items: KV, KVRefValueHash, and KVValueHash nodes holding a non-tree element. */
  kv: number;
  /** Subtree references: KVValueHash* nodes holding a tree element. */
  kvValueHash: number;
  /** KVHash / KVDigest siblings. */
  kvHash: number;
  /** Hash siblings. */
  hash: number;
  combine: number;
  /** Issues found while reconstructing this layer's tree. */
  issues: string[];
  /** A few sample data keys at this layer, for orientation. */
  sampleKeys: string[];
}

export interface ProofSummary {
  layers: ProofLayerSummary[];
  totals: { kv: number; kvValueHash: number; kvHash: number; hash: number; combine: number; issues: number };
}

/** Per-layer op statistics, derived from the same parse the tree view uses. */
export function summarizeProof(root: ParsedLayer | null): ProofSummary {
  const totals = { kv: 0, kvValueHash: 0, kvHash: 0, hash: 0, combine: 0, issues: 0 };
  if (!root) return { layers: [], totals };
  const layers = flattenLayers(root).map((layer): ProofLayerSummary => {
    const s: ProofLayerSummary = {
      layer, kv: 0, kvValueHash: 0, kvHash: 0, hash: 0, combine: 0,
      issues: buildLayerTree(layer).issues,
      sampleKeys: [],
    };
    for (const op of layer.ops) {
      if (op.kind === 'combine') s.combine++;
      else if (op.kind === 'kvHash' || op.kind === 'kvDigest') s.kvHash++;
      else if (op.kind === 'hash') s.hash++;
      else if (leafKind(op, layer.children) === 'subtree') s.kvValueHash++;
      else {
        s.kv++;
        if (op.key !== undefined && s.sampleKeys.length < 3) s.sampleKeys.push(op.key);
      }
    }
    totals.kv += s.kv;
    totals.kvValueHash += s.kvValueHash;
    totals.kvHash += s.kvHash;
    totals.hash += s.hash;
    totals.combine += s.combine;
    totals.issues += s.issues.length;
    return s;
  });
  return { layers, totals };
}
