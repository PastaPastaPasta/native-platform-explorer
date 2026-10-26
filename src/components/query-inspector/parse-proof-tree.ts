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
  | 'kv'              // Push(KV(key, value)) / KVCount — data item proven by the query
  | 'kvValueHash'     // Push(KVValueHash(key, value, HASH)) and the FeatureType variants
  | 'kvRefValueHash'  // Push(KVRefValueHash(key, value, HASH)) — reference resolved to its value
  | 'kvDigest'        // Push(KVDigest(key, HASH)) — sibling (value omitted)
  | 'kvHash'          // Push(KVHash(HASH)) — sibling
  | 'hash'            // Push(Hash(HASH)) — deep sibling
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
  /** For ops carrying a hash, the 32-byte hash as hex. */
  hash?: string;
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

/** Element descriptors that open a nested subtree (Tree, SumTree, CountTree, MmrTree, …). */
const TREE_ELEMENT = /^\w*Tree\(/;

export function leafKind(op: OpNode): TreeNode['kind'] {
  if (op.kind === 'kv' || op.kind === 'kvRefValueHash') return 'kv';
  if (op.kind === 'kvValueHash') return op.isTree ? 'subtree' : 'kv';
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
      stack.push({ op, kind: leafKind(op) });
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
      let context: GroveContext;
      let decoded: DecodedKey | undefined;
      if (!parent) {
        context = 'root';
      } else {
        decoded = decodeGroveKey(nextParentKey, parent.context);
        context = decoded.nextContext ?? 'unknown';
      }
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

    const op = parseOpLine(line);
    if (op === 'not-an-op') continue;
    if (typeof op === 'string') {
      cur.issues.push(op);
      continue;
    }
    if (op.kind === 'hash' && op.variant !== 'Hash') {
      cur.issues.push(`Op ${op.index} uses the unrecognized node variant ${op.variant}; it is drawn as an opaque sibling.`);
    }
    cur.ops.push(op);
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
 * Parse a single op line. Returns `'not-an-op'` for lines that aren't ops
 * (headers, blank lines), an `OpNode` for a recognized op, or an issue string
 * for an op line we could not interpret.
 */
function parseOpLine(line: string): OpNode | string | 'not-an-op' {
  // Lines look like: `0: Push(KV(0xabc..., Item(0x0b)))` or `2: Parent`.
  const prefixMatch = line.match(/^(\d+):\s*(.*)$/);
  if (!prefixMatch) return 'not-an-op';
  const index = Number(prefixMatch[1]);
  const body = balanceTrailingParens(prefixMatch[2]!.trim());

  if (body === 'Parent' || body === 'Child' || body === 'ParentInverted' || body === 'ChildInverted') {
    return { kind: 'combine', index, raw: line, combine: body };
  }

  const pushMatch = body.match(/^(Push|PushInverted)\((\w+)\((.*)\)\)$/);
  if (!pushMatch) {
    if (body.startsWith('Error decoding op')) return `Op ${index}: the parser stopped (${body}).`;
    return `Op ${index} is not a recognized Merk op: ${body.slice(0, 120)}`;
  }
  const [, push, variant, inner] = pushMatch as unknown as [string, string, string, string];
  const base = { index, raw: line, variant, ...(push === 'PushInverted' ? { inverted: true } : {}) };

  // Reference: grovedb-query/src/proofs/mod.rs `enum Node`, as printed by
  // node_to_string. The *Count variants carry a trailing u64 we show but
  // otherwise ignore; every variant pushes exactly one node.
  switch (variant) {
    case 'KV':
    case 'KVCount': {
      const [key, rest] = splitKey(inner);
      const parts = splitTopLevelArgs(rest);
      if (parts.length < 1 || (variant === 'KVCount' && parts.length < 2)) break;
      const count = variant === 'KVCount' ? ` (count=${parts[parts.length - 1]})` : '';
      const value = (variant === 'KVCount' ? parts.slice(0, -1) : parts).join(', ');
      return { ...base, kind: 'kv', key, value: value + count };
    }
    case 'KVValueHash':
    case 'KVValueHashFeatureType':
    case 'KVValueHashFeatureTypeWithChildHash':
    case 'KVRefValueHash':
    case 'KVRefValueHashCount': {
      const [key, rest] = splitKey(inner);
      const parts = splitTopLevelArgs(rest);
      if (parts.length < 2) break;
      const element = parts[0]!;
      const extra =
        variant === 'KVRefValueHashCount' && parts[2] ? ` (count=${parts[2]})` :
        variant.startsWith('KVValueHashFeatureType') && parts[2] ? ` ${parts[2]}` :
        '';
      const hash = extractHash(parts[1]!);
      if (variant.startsWith('KVRef')) {
        return { ...base, kind: 'kvRefValueHash', key, value: element + extra, hash };
      }
      return {
        ...base,
        kind: 'kvValueHash',
        key,
        treeValue: element + extra,
        isTree: TREE_ELEMENT.test(element),
        hash,
      };
    }
    case 'KVDigest':
    case 'KVDigestCount': {
      const [key, rest] = splitKey(inner);
      return { ...base, kind: 'kvDigest', key, hash: extractHash(rest) };
    }
    case 'KVHash':
    case 'KVHashCount':
      return { ...base, kind: 'kvHash', hash: extractHash(inner) };
    case 'Hash':
      return { ...base, kind: 'hash', hash: extractHash(inner) };
    default:
      // Every Push variant pushes one node, so keep the stack in sync with an
      // opaque sibling (reported by the caller).
      return { ...base, kind: 'hash' };
  }
  return `Op ${index} (${variant}) has an unexpected shape: ${body.slice(0, 120)}`;
}

function extractHash(s: string): string | undefined {
  const m = s.match(/HASH\[([0-9a-fA-F]+)\]/);
  return m ? m[1] : undefined;
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

/** Split top-level comma-separated args in a single linear pass. */
function splitTopLevelArgs(s: string): string[] {
  if (!s) return [];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
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
      else if (leafKind(op) === 'subtree') s.kvValueHash++;
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
