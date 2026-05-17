/**
 * Parse the grovedb-proof-parser text output into a structured tree.
 *
 * Each LayerProof becomes a `ParsedLayer` with its ops captured in order and
 * its nested `lower_layers` linked as `children`. The renderer can then walk
 * the structure recursively and show each subtree where it belongs.
 */

import { decodeGroveKey, type DecodedKey, type GroveContext } from './grovedb-schema';

export type OpKind =
  | 'kv'              // Push(KV(key, value)) — data item proven by the query
  | 'kvValueHash'     // Push(KVValueHash(key, Tree(...), HASH)) — subtree ref
  | 'kvRefValueHash'  // Push(KVRefValueHash(...)) — reference node variant
  | 'kvDigest'        // Push(KVDigest(key, HASH)) — sibling (value omitted)
  | 'kvHash'          // Push(KVHash(HASH)) — sibling
  | 'hash'            // Push(Hash(HASH)) — deep sibling
  | 'combine';        // Parent / Child stack-combine op

export interface OpNode {
  kind: OpKind;
  /** Op index within the layer (matches the `0:`, `1:`, ... prefix in raw text). */
  index: number;
  /** Original raw line, for fallback display. */
  raw: string;
  /** For KV* ops, the key as the parser emitted it (printable char, 0x.., or `x`). */
  key?: string;
  /** For Push(KV(...)), the value text (e.g. "Item(0x0b)", or a nested Tree). */
  value?: string;
  /** For Push(KVValueHash(...)), the inner value descriptor (e.g. "Tree(01)", "SumTree(04e9, 12345)"). */
  treeValue?: string;
  /** For ops carrying a hash, the 32-byte hash as hex. */
  hash?: string;
  /** For combine ops, which kind. */
  combine?: 'Parent' | 'Child' | 'ParentInverted' | 'ChildInverted';
}

export interface ParsedLayer {
  /** 1-indexed layer number, assigned during a depth-first walk. */
  layerIndex: number;
  /** Raw key that opened this layer (matches a key in the parent's `lower_layers`). Empty for root. */
  parentKey: string;
  /** Semantic decoding of `parentKey`. */
  decodedParentKey?: DecodedKey;
  /** GroveDB context for THIS layer (root | identity | tokens | ...). */
  context: GroveContext;
  /** All ops in order. */
  ops: OpNode[];
  /** Nested layers, keyed by the raw key that opens them. */
  children: Map<string, ParsedLayer>;
}

/** A node in the reconstructed binary merkle tree. */
export interface TreeNode {
  /** Source op that produced this leaf (undefined for synthetic internal nodes — never happens in practice; every node here comes from a Push op). */
  op?: OpNode;
  kind: 'kv' | 'subtree' | 'sibling';
  left?: TreeNode;
  right?: TreeNode;
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

function leafKind(op: OpNode): TreeNode['kind'] {
  if (op.kind === 'kv') return 'kv';
  if (op.kind === 'kvValueHash' || op.kind === 'kvRefValueHash') return 'subtree';
  return 'sibling';
}

/**
 * Reconstruct the binary merkle tree by replaying the layer's stack operations.
 * After running every op, a well-formed proof leaves exactly one node on the
 * stack — the layer's root. Returns null if the stack was empty or malformed.
 */
export function buildLayerTree(layer: ParsedLayer): TreeNode | null {
  const stack: TreeNode[] = [];
  for (const op of layer.ops) {
    if (op.kind !== 'combine') {
      stack.push({ op, kind: leafKind(op) });
      continue;
    }
    if (!op.combine) continue;
    if (stack.length < 2) {
      // Malformed proof: combine op with <2 stack items. Merk treats this as
      // a hard error; we're a read-only viewer, so warn and skip — but flag it
      // so a developer staring at a half-built tree knows why.
      if (typeof console !== 'undefined') {
        console.warn(
          `[proof-tree] stack underflow at op ${op.index} (${op.combine}); ` +
          `proof may be malformed. Render will continue with partial tree.`,
        );
      }
      continue;
    }
    const top = stack.pop()!;
    const below = stack.pop()!;
    const rule = COMBINE_RULES[op.combine];
    const parent = rule.topIsParent ? top : below;
    const child = rule.topIsParent ? below : top;
    if (rule.childGoesLeft) parent.left = child;
    else parent.right = child;
    stack.push(parent);
  }
  return stack[stack.length - 1] ?? null;
}

/**
 * Top-level parse. Returns null if no LayerProof was found.
 */
export function parseProofTree(text: string): ParsedLayer | null {
  // Strip CR so Windows line endings don't leak into op bodies.
  const lines = text.replace(/\r/g, '').split('\n');

  // Each frame is either an open layer (with the under-construction layer) or
  // a non-layer brace block (`lower_layers: {`, `<key> => {`, the outer
  // wrapper, etc.). Brace tracking is symmetric — every `{` opens a frame,
  // every `}` pops one.
  const blockStack: Array<{ isLayer: boolean; layer?: ParsedLayer; parent?: ParsedLayer; parentKey?: string }> = [];
  let root: ParsedLayer | null = null;
  let nextParentKey = '';

  const currentLayer = (): ParsedLayer | undefined => {
    for (let i = blockStack.length - 1; i >= 0; i--) {
      if (blockStack[i]!.isLayer) return blockStack[i]!.layer;
    }
    return undefined;
  };

  const makeLayer = (parentKey: string, decoded: DecodedKey | undefined, context: GroveContext): ParsedLayer => ({
    layerIndex: 0, // filled in during second pass
    parentKey,
    decodedParentKey: decoded,
    context,
    ops: [],
    children: new Map(),
  });

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('LayerProof {')) {
      const parent = currentLayer();
      let context: GroveContext;
      let decoded: DecodedKey | undefined;
      if (!parent) {
        context = 'root';
      } else {
        decoded = decodeGroveKey(nextParentKey, parent.context);
        context = decoded.nextContext ?? 'unknown';
      }
      const layer = makeLayer(nextParentKey, decoded, context);
      if (!root) root = layer;
      if (parent) parent.children.set(nextParentKey, layer);
      blockStack.push({ isLayer: true, layer, parent, parentKey: nextParentKey });
      nextParentKey = '';
      continue;
    }

    if (line === '}') {
      blockStack.pop();
      continue;
    }

    const childMatch = line.match(/^(\S+)\s*=>\s*\{/);
    if (childMatch) {
      nextParentKey = childMatch[1] ?? '';
      blockStack.push({ isLayer: false });
      continue;
    }

    if (line.endsWith('{')) {
      blockStack.push({ isLayer: false });
      continue;
    }

    const cur = currentLayer();
    if (!cur) continue;

    const op = parseOp(line, cur.ops.length);
    if (op) cur.ops.push(op);
  }

  if (root) assignLayerIndices(root, { n: 1 });
  return root;
}

function assignLayerIndices(layer: ParsedLayer, counter: { n: number }): void {
  layer.layerIndex = counter.n++;
  for (const child of layer.children.values()) {
    assignLayerIndices(child, counter);
  }
}

/**
 * Parse a single op line. Returns null for lines that aren't ops (e.g. the
 * `merk_proof:` header or empty lines).
 */
function parseOp(line: string, index: number): OpNode | null {
  // Lines look like: `0: Push(KV(0xabc..., Item(0x0b)))` or `2: Parent`.
  // Strip the leading "N:" prefix.
  const prefixMatch = line.match(/^\d+:\s*(.*)$/);
  const body = prefixMatch ? prefixMatch[1]! : line;

  if (body === 'Parent') return { kind: 'combine', index, raw: line, combine: 'Parent' };
  if (body === 'Child') return { kind: 'combine', index, raw: line, combine: 'Child' };
  if (body === 'ParentInverted') return { kind: 'combine', index, raw: line, combine: 'ParentInverted' };
  if (body === 'ChildInverted') return { kind: 'combine', index, raw: line, combine: 'ChildInverted' };

  // Anchor on `Push(<Name>(` ... `))` rather than fixed-length suffix stripping,
  // so trailing whitespace / CR doesn't shift the slice indices.
  const pushMatch = body.match(/^Push\((\w+)\((.*)\)\)\s*$/);
  if (pushMatch) {
    const [, name, inner] = pushMatch as unknown as [string, string, string];
    // Reference: grovedb-query/src/proofs/mod.rs `enum Node` — 11 variants.
    // Variants we recognize, mapped to our OpKind classification. The trailing
    // *Count* variants carry an extra u64 count we don't visualize but still
    // need to consume so the stack count stays in sync with merk's verifier
    // (otherwise later combine ops underflow).
    switch (name) {
      // KV(key, value)
      case 'KV': {
        const split = splitFirstTopLevelComma(inner);
        if (split) return { kind: 'kv', index, raw: line, key: split[0], value: split[1] };
        break;
      }
      // KVCount(key, value, count) — same shape + trailing count
      case 'KVCount': {
        const parts = splitTopLevelArgs(inner);
        if (parts.length >= 3) {
          return { kind: 'kv', index, raw: line, key: parts[0], value: `${parts[1]} (count=${parts[2]})` };
        }
        break;
      }
      // KVValueHash(key, value, hash)
      // KVRefValueHash(key, value, hash)
      // KVValueHashFeatureType(key, value, hash, feature_type) — trailing feature
      // KVRefValueHashCount(key, value, hash, count) — trailing count
      case 'KVValueHash':
      case 'KVRefValueHash':
      case 'KVValueHashFeatureType':
      case 'KVRefValueHashCount': {
        const parts = splitTopLevelArgs(inner);
        if (parts.length >= 3) {
          const isRef = name === 'KVRefValueHash' || name === 'KVRefValueHashCount';
          const extra =
            name === 'KVValueHashFeatureType' && parts[3] ? ` ${parts[3]}` :
            name === 'KVRefValueHashCount' && parts[3] ? ` (count=${parts[3]})` :
            '';
          return {
            kind: isRef ? 'kvRefValueHash' : 'kvValueHash',
            index,
            raw: line,
            key: parts[0],
            treeValue: (parts[1] ?? '') + extra,
            hash: extractHash(parts[2] ?? ''),
          };
        }
        break;
      }
      // KVDigest(key, hash)
      // KVDigestCount(key, hash, count) — trailing count
      case 'KVDigest':
      case 'KVDigestCount': {
        const parts = splitTopLevelArgs(inner);
        if (parts.length >= 2) {
          return { kind: 'kvDigest', index, raw: line, key: parts[0], hash: extractHash(parts[1] ?? '') };
        }
        break;
      }
      // KVHash(hash)
      // KVHashCount(hash, count) — trailing count
      case 'KVHash':
      case 'KVHashCount':
        return { kind: 'kvHash', index, raw: line, hash: extractHash(inner) };
      // Hash(hash)
      case 'Hash':
        return { kind: 'hash', index, raw: line, hash: extractHash(inner) };
    }
    // Unknown Push variant — log so we notice rather than silently dropping
    // (which would cause stack underflow on subsequent combine ops).
    if (typeof console !== 'undefined') {
      console.warn(`[proof-tree] unknown Push variant '${name}' at op ${index}; treating as opaque sibling so the stack stays in sync.`);
    }
    return { kind: 'hash', index, raw: line };
  }

  return null;
}

function extractHash(s: string): string | undefined {
  const m = s.match(/HASH\[([0-9a-fA-F]+)\]/);
  return m ? m[1] : undefined;
}

/** Split "a, b" into ["a", "b"] respecting nested parens/brackets. */
function splitFirstTopLevelComma(s: string): [string, string] | null {
  const idx = findTopLevelComma(s, 0);
  if (idx === -1) return null;
  return [s.slice(0, idx).trim(), s.slice(idx + 1).trim()];
}

/** Split top-level comma-separated args in a single linear pass. */
function splitTopLevelArgs(s: string): string[] {
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

function findTopLevelComma(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}
