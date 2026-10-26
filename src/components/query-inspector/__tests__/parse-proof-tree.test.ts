import { describe, expect, it } from 'vitest';
import {
  buildLayerTree,
  flattenLayers,
  parseProofTree,
  summarizeProof,
  type ParsedLayer,
  type TreeNode,
} from '../parse-proof-tree';
import { proofText } from './proof-fixtures';

const ASC = proofText('testnet-dpns-domain-asc');
const DESC = proofText('testnet-dpns-domain-desc');

function inOrderKeys(root: TreeNode | null): string[] {
  const keys: string[] = [];
  const pending: TreeNode[] = [];
  let node = root ?? undefined;
  while (node || pending.length) {
    while (node) { pending.push(node); node = node.left; }
    const next = pending.pop()!;
    if (next.op.key !== undefined) keys.push(next.op.key);
    node = next.right;
  }
  return keys;
}

function layerByKey(root: ParsedLayer, key: string): ParsedLayer {
  const layer = flattenLayers(root).find((l) => l.parentKey === key);
  if (!layer) throw new Error(`no layer for ${key}`);
  return layer;
}

/** Op lines printed by the parser, counted independently of the parser under test. */
function printedOps(text: string, pattern: RegExp): number {
  return text.split('\n').filter((line) => pattern.test(line.trim())).length;
}

describe('parseProofTree on real testnet proofs', () => {
  it.each([['ascending', ASC], ['descending', DESC]])('reconstructs every %s layer to a single root', (_, text) => {
    const root = parseProofTree(text)!;
    const layers = flattenLayers(root);
    expect(layers).toHaveLength(11);
    for (const layer of layers) {
      const tree = buildLayerTree(layer);
      expect(tree.issues, `layer ${layer.layerIndex}`).toEqual([]);
      expect(tree.root).not.toBeNull();
    }
    const opLines = printedOps(text, /^\d+: /);
    expect(layers.reduce((n, l) => n + l.ops.length, 0)).toBe(opLines);
  });

  it('keeps PushInverted ops and their printed indices', () => {
    const labels = layerByKey(parseProofTree(DESC)!, 'normalizedLabel');
    expect(labels.ops).toHaveLength(41);
    expect(labels.ops.map((op) => op.index)).toEqual(Array.from({ length: 41 }, (_, i) => i));
    const pushes = labels.ops.filter((op) => op.kind !== 'combine');
    expect(pushes.every((op) => op.inverted)).toBe(true);
    expect(labels.ops.filter((op) => op.combine === 'ParentInverted')).toHaveLength(10);
    expect(labels.ops.filter((op) => op.combine === 'ChildInverted')).toHaveLength(10);
  });

  it('orders an inverted layer like the ascending index', () => {
    const tree = buildLayerTree(layerByKey(parseProofTree(DESC)!, 'normalizedLabel'));
    expect(inOrderKeys(tree.root)).toEqual(['zxzaart1mqxksaph', 'zxzdgnm0uedhmztt', 'zzunused1779968351']);
  });

  it('strips the V1 Merk( closing parenthesis from the last op of a layer', () => {
    const root = parseProofTree(ASC)!;
    expect(root.ops.at(-1)).toMatchObject({ kind: 'combine', combine: 'Child', index: 4 });
    const single = layerByKey(root, 'dash');
    expect(single.ops).toHaveLength(1);
    expect(single.ops[0]).toMatchObject({ kind: 'kvValueHash', key: 'normalizedLabel', isTree: true });
    expect(single.ops[0]!.treeValue).toMatch(/^Tree\([0-9a-f]+\)$/);
  });

  it('decodes printable multi-character keys along the DPNS document path', () => {
    const root = parseProofTree(ASC)!;
    const chain = flattenLayers(root).slice(0, 9).map((l) => [l.parentKey, l.context]);
    expect(chain).toEqual([
      ['', 'root'],
      ['@', 'data-contract'],
      ['0xe668c659af66aee1e72c186dde7b5b7e0a1d712a09c40d5721f622bf53c53155', 'contract-id'],
      ['0x01', 'contract-documents'],
      ['domain', 'document-type'],
      ['normalizedParentDomainName', 'index-property'],
      ['dash', 'index-value'],
      ['normalizedLabel', 'index-property'],
      [expect.any(String), 'index-value'],
    ]);
    expect(layerByKey(root, 'domain').decodedParentKey?.name).toBe("'domain' (document type)");
    expect(layerByKey(root, 'normalizedLabel').decodedParentKey?.name).toBe("'normalizedLabel' (index property)");
  });

  it('classifies resolved references as data and tree elements as subtrees', () => {
    const summary = summarizeProof(parseProofTree(DESC));
    expect(summary.totals.kv).toBe(3);
    expect(summary.totals.issues).toBe(0);
    const leaves = summary.layers.filter((l) => l.kv > 0);
    expect(leaves.map((l) => l.layer.parentKey)).toEqual(['zxzaart1mqxksaph', 'zxzdgnm0uedhmztt', 'zzunused1779968351']);
    expect(leaves[0]!.layer.ops[0]).toMatchObject({ kind: 'kvRefValueHash', key: '0x00' });
    expect(summary.totals.combine).toBe(printedOps(DESC, /^\d+: (Parent|Child|ParentInverted|ChildInverted)\)*$/));
  });
});

describe('parseProofTree on a real testnet sum-tree proof', () => {
  const SUM = proofText('testnet-release-range-sum');

  it('reconstructs every layer and reads the ProvableSumTree nodes', () => {
    const root = parseProofTree(SUM)!;
    const layers = flattenLayers(root);
    for (const layer of layers) {
      expect(buildLayerTree(layer).issues, `layer ${layer.layerIndex}`).toEqual([]);
    }
    expect(layers.reduce((n, l) => n + l.ops.length, 0)).toBe(printedOps(SUM, /^\d+: /));

    const tags = layerByKey(root, 'tagName');
    expect(tags.ops).toEqual([
      expect.objectContaining({ kind: 'kvDigest', variant: 'KVDigestSum', key: 'e2e-rel2a-cli-p2-20261017', sum: '2', hash: expect.stringMatching(/^ce1b3240[0-9a-f]{56}$/) }),
      expect.objectContaining({ kind: 'hash', variant: 'HashWithSum', sum: '1', hash: expect.stringMatching(/^13b1c739[0-9a-f]{56}$/) }),
      expect.objectContaining({ kind: 'combine', combine: 'Child' }),
    ]);
    expect(tags.ops[0]!.count).toBeUndefined();
    const tree = buildLayerTree(tags);
    expect(tree.root).toMatchObject({ kind: 'sibling', op: { variant: 'KVDigestSum' }, right: { op: { variant: 'HashWithSum' } } });
  });

  it('decodes the document path down to the summed index and descends into the sum tree', () => {
    const root = parseProofTree(SUM)!;
    expect(layerByKey(root, 'release').decodedParentKey?.name).toBe("'release' (document type)");
    expect(layerByKey(root, 'repoId').decodedParentKey?.name).toBe("'repoId' (index property)");
    expect(layerByKey(root, 'tagName').context).toBe('index-property');
    const parent = flattenLayers(root).find((l) => l.children.has('tagName'))!;
    const sumTree = parent.ops.find((op) => op.key === 'tagName')!;
    expect(sumTree).toMatchObject({ kind: 'kvValueHash', isTree: true });
    expect(sumTree.treeValue).toMatch(/^ProvableSumTree\([0-9a-f]+, 2\)$/);
    const summary = summarizeProof(root);
    expect(summary.totals.issues).toBe(0);
    // An aggregate proof attests to totals, not to individual documents.
    expect(summary.totals.kv).toBe(0);
  });
});

describe('parseProofTree on a real testnet AVG proof', () => {
  const AVG = proofText('testnet-grades-semester-avg');

  it('reconstructs every layer and keeps each per-semester count-sum tree as a result', () => {
    const root = parseProofTree(AVG)!;
    const layers = flattenLayers(root);
    for (const layer of layers) {
      expect(buildLayerTree(layer).issues, `layer ${layer.layerIndex}`).toEqual([]);
    }
    expect(layers.reduce((n, l) => n + l.ops.length, 0)).toBe(printedOps(AVG, /^\d+: /));
    const semesters = layerByKey(root, 'semester');
    const results = semesters.ops.filter((op) => op.kind === 'kvValueHash');
    expect(results.map((op) => op.treeValue?.match(/^ProvableCountProvableSumTree\(00, (\d+), (\d+)/)?.slice(1))).toEqual([
      ['9', '698'], ['2', '110'], ['5', '418'], ['7', '556'], ['8', '649'], ['3', '173'],
    ]);
    // The per-semester trees are not descended into: they are the proven aggregates.
    expect(results.every((op) => !semesters.children.has(op.key!))).toBe(true);
    expect(summarizeProof(root).totals.issues).toBe(0);
  });
});

describe('parseProofTree op variants and layouts', () => {
  it('parses the V0 merk_proof layout', () => {
    // Synthetic: GroveDBProofV0 Display layout with hand-written ops.
    const text = [
      'GroveDBProofV0 {',
      '  LayerProof {',
      '    merk_proof: ',
      '      0: Push(Hash(HASH[aa]))',
      '      1: Push(KVValueHash(@, Tree(01), HASH[bb]))',
      '      2: Parent',
      '    lower_layers: {',
      '      @ => {',
      '        LayerProof {',
      '          merk_proof: ',
      '            0: Push(KV(0x01, Item(0x0b)))',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const root = parseProofTree(text)!;
    expect(root.ops.map((op) => op.kind)).toEqual(['hash', 'kvValueHash', 'combine']);
    expect(buildLayerTree(root).issues).toEqual([]);
    expect(root.children.get('@')!.ops[0]).toMatchObject({ kind: 'kv', key: '0x01', value: 'Item(0x0b)' });
  });

  it('treats KVValueHashFeatureTypeWithChildHash as an expandable subtree', () => {
    const text = [
      'LayerProof {',
      '  proof: Merk(',
      '    0: Push(KVValueHashFeatureTypeWithChildHash(counts, CountTree(00, 7), HASH[aa], ProvableCountedMerkNode(7), HASH[bb])))',
      '  lower_layers: {',
      '    counts => {',
      '      LayerProof {',
      '        proof: Merk(',
      '          0: Push(KVCount(k, Item(0x01), 1)))',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const root = parseProofTree(text)!;
    const tree = buildLayerTree(root);
    expect(tree.root).toMatchObject({ kind: 'subtree', op: { key: 'counts', isTree: true, hash: 'aa' } });
    expect(root.children.get('counts')!.ops[0]).toMatchObject({ kind: 'kv', value: 'Item(0x01) (count=1)' });
  });

  it('classifies every count and sum node variant like its base variant', () => {
    const H = (c: string) => `HASH[${c.repeat(64)}]`;
    const ops = [
      `Push(KVSum(a, Item(0x01), -5))`,
      `Push(KVCountSum(b, SumItem(7), count=3, sum=21))`,
      `Push(KVRefValueHashSum(c, Item(0x02), ${H('1')}, 9))`,
      `Push(KVRefValueHashCountSum(d, Item(0x03), ${H('2')}, count=1, sum=4))`,
      `Push(KVDigestCount(e, ${H('3')}, 6))`,
      `Push(KVDigestCountSum(f, ${H('4')}, count=2, sum=-8))`,
      `Push(KVHashSum(${H('5')}, 12))`,
      `Push(KVHashCountSum(${H('6')}, count=4, sum=40))`,
      `Push(HashWithCount(kv_hash=${H('7')}, left=${H('0')}, right=${H('0')}, count=11))`,
      `Push(HashWithCountAndSum(kv_hash=${H('8')}, left=${H('0')}, right=${H('9')}, count=5, sum=50))`,
      `PushInverted(KVBackwardsReferencesValueHash(g, Item(0x04), ${H('a')}))`,
    ];
    const root = parseProofTree(['LayerProof {', '  proof: Merk(', ...ops.map((op, i) => `    ${i}: ${op}`), '}'].join('\n'))!;
    expect(root.issues).toEqual([]);
    expect(root.ops.map((op) => [op.variant, op.kind, op.key, op.count, op.sum])).toEqual([
      ['KVSum', 'kv', 'a', undefined, '-5'],
      ['KVCountSum', 'kv', 'b', '3', '21'],
      ['KVRefValueHashSum', 'kvRefValueHash', 'c', undefined, '9'],
      ['KVRefValueHashCountSum', 'kvRefValueHash', 'd', '1', '4'],
      ['KVDigestCount', 'kvDigest', 'e', '6', undefined],
      ['KVDigestCountSum', 'kvDigest', 'f', '2', '-8'],
      ['KVHashSum', 'kvHash', undefined, undefined, '12'],
      ['KVHashCountSum', 'kvHash', undefined, '4', '40'],
      ['HashWithCount', 'hash', undefined, '11', undefined],
      ['HashWithCountAndSum', 'hash', undefined, '5', '50'],
      ['KVBackwardsReferencesValueHash', 'kvRefValueHash', 'g', undefined, undefined],
    ]);
    expect(root.ops.map((op) => op.value)).toEqual([
      'Item(0x01) (sum=-5)', 'SumItem(7) (count=3, sum=21)', 'Item(0x02) (sum=9)', 'Item(0x03) (count=1, sum=4)',
      undefined, undefined, undefined, undefined, undefined, undefined, 'Item(0x04)',
    ]);
    expect(root.ops.map((op) => op.hash?.[0])).toEqual([undefined, undefined, '1', '2', '3', '4', '5', '6', '7', '8', 'a']);
    expect(root.ops.at(-1)!.inverted).toBe(true);
    const summary = summarizeProof(root).totals;
    expect(summary).toMatchObject({ kv: 5, kvHash: 4, hash: 2 });
  });

  it('flags count and sum nodes whose aggregate is missing or mislabeled', () => {
    const root = parseProofTree([
      'LayerProof {', '  proof: Merk(',
      '    0: Push(KVSum(a, Item(0x01)))',
      '    1: Push(KVHashCountSum(HASH[aa], sum=1, count=2))',
      '    2: Push(HashWithSum(kv_hash=HASH[bb], sum=3))',
      '}',
    ].join('\n'))!;
    expect(root.ops.map((op) => op.kind)).toEqual(['hash', 'hash', 'hash']);
    expect(root.issues).toHaveLength(3);
    expect(root.issues[0]).toBe('Op 0 (KVSum) has an unexpected shape and is drawn as an opaque sibling: Push(KVSum(a, Item(0x01)))');
  });

  it('reads keys containing brackets and an empty key', () => {
    const text = [
      'LayerProof {',
      '  proof: Merk(',
      '    0: Push(KVValueHash(a[b]/c, Tree(01), HASH[cc]))',
      '    1: Push(KVDigest(], HASH[dd]))',
      '    2: Child',
      '    3: Push(KV(, Item(0x00, flags: [1, 2])))',
      '    4: Parent)',
      '  lower_layers: {',
      '    a[b]/c => {',
      '      LayerProof {',
      '        proof: Merk(',
      '          0: Push(Hash(HASH[ee])))',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const root = parseProofTree(text)!;
    expect(root.ops[0]).toMatchObject({ key: 'a[b]/c', treeValue: 'Tree(01)', hash: 'cc' });
    expect(root.ops[1]).toMatchObject({ kind: 'kvDigest', key: ']', hash: 'dd' });
    expect(root.ops[3]).toMatchObject({ kind: 'kv', key: '', value: 'Item(0x00, flags: [1, 2])' });
    expect(buildLayerTree(root).issues).toEqual([]);
    expect(root.children.has('a[b]/c')).toBe(true);
  });
});

describe('parseProofTree printed values', () => {
  it('keeps the stack in sync when item text holds an unbalanced bracket', () => {
    const root = parseProofTree([
      'LayerProof {', '  proof: Merk(',
      '    0: Push(KVRefValueHash(k1, Item([abc), HASH[aa]))',
      '    1: Push(KVHash(HASH[bb]))',
      '    2: Parent)',
      '}',
    ].join('\n'))!;
    expect(root.ops[0]).toMatchObject({ kind: 'kvRefValueHash', key: 'k1', value: 'Item([abc)', hash: 'aa' });
    expect(buildLayerTree(root).issues).toEqual([]);
  });

  it('draws an unreadable Push as an opaque node instead of desyncing the stack', () => {
    const root = parseProofTree(['LayerProof {', '  proof: Merk(', '    0: Push(KVDigest(k, HASH[aa]))', '    1: Push(KV(k2))', '    2: Child)', '}'].join('\n'))!;
    const tree = buildLayerTree(root);
    expect(tree.root?.right?.op).toMatchObject({ index: 1, kind: 'hash', variant: 'KV' });
    expect(tree.issues).toEqual(['Op 1 (KV) has an unexpected shape and is drawn as an opaque sibling: Push(KV(k2))']);
  });

  it('counts a tree element without a lower layer as the result, not a subtree', () => {
    // Aggregate proofs end in count/sum tree elements that are not descended into.
    const root = parseProofTree(['LayerProof {', '  proof: Merk(', '    0: Push(KVValueHashFeatureType(class, CountTree(00, 4), HASH[aa], CountedMerkNode(4))))', '}'].join('\n'))!;
    expect(buildLayerTree(root).root?.kind).toBe('kv');
    expect(summarizeProof(root).totals).toMatchObject({ kv: 1, kvValueHash: 0 });
  });

  it.each(['NonCounted(Tree(01))', 'NotSummed(SumTree(01, 5))', 'NotCountedOrSummed(NonCounted(CountTree(01, 2)))', 'PrivateDocumentStore(count: 2, entry_size: 8, chunk_power: 4)'])(
    'treats the wrapped tree element %s as a subtree',
    (element) => {
      const text = ['LayerProof {', '  proof: Merk(', `    0: Push(KVValueHash(t, ${element}, HASH[aa])))`, '  lower_layers: {', '    t => {', '      LayerProof {', '        proof: Merk(', '          0: Push(KV(k, Item(0x01))))', '      }', '    }', '  }', '}'].join('\n');
      const root = parseProofTree(text)!;
      expect(root.ops[0]).toMatchObject({ kind: 'kvValueHash', isTree: true });
      expect(buildLayerTree(root).root?.kind).toBe('subtree');
    },
  );
  it('does not read a wrapped item as a tree', () => {
    const root = parseProofTree(['LayerProof {', '  proof: Merk(', '    0: Push(KVValueHash(t, NonCounted(Item(0x54726565283031)), HASH[aa])))', '}'].join('\n'))!;
    expect(root.ops[0]).toMatchObject({ isTree: false });
  });
});

describe('buildLayerTree on malformed proofs', () => {
  function layer(ops: string[]): ParsedLayer {
    return parseProofTree(['LayerProof {', '  proof: Merk(', ...ops.map((op, i) => `    ${i}: ${op}`), '}'].join('\n'))!;
  }

  it('reports a stack underflow', () => {
    const { root, issues } = buildLayerTree(layer(['Push(Hash(HASH[aa]))', 'Parent']));
    expect(root?.op.index).toBe(0);
    expect(issues).toEqual(['Op 1 (Parent) needs two nodes but the stack holds 1.']);
  });

  it('keeps the first child when a second one targets the same slot', () => {
    const { root, issues } = buildLayerTree(layer([
      'Push(Hash(HASH[aa]))', 'Push(KVHash(HASH[bb]))', 'Parent',
      'Push(Hash(HASH[cc]))', 'Child',
      'Push(Hash(HASH[dd]))', 'Child',
    ]));
    expect(root?.op.index).toBe(1);
    expect(root?.right?.op.index).toBe(3);
    expect(issues).toEqual(['Op 6 (Child) attaches a right child to op 1, which already has one.']);
  });

  it('reports leftover nodes and unreadable op lines', () => {
    const { issues } = buildLayerTree(layer(['Push(Hash(HASH[aa]))', 'Push(Hash(HASH[bb]))', 'Frobnicate', 'Error decoding op: oops']));
    expect(issues).toEqual([
      'Op 2 is not a recognized Merk op: Frobnicate',
      'Op 3: the parser stopped (Error decoding op: oops).',
      '2 nodes were never combined into one tree; showing the last one.',
    ]);
  });

  it('reports unknown node variants but keeps the stack in sync', () => {
    const { root, issues } = buildLayerTree(layer(['Push(Hash(HASH[aa]))', 'Push(KVFuture(x, HASH[bb]))', 'Parent']));
    expect(root?.left?.op.index).toBe(0);
    expect(issues).toEqual(['Op 1 uses the unrecognized node variant KVFuture; it is drawn as an opaque sibling.']);
    expect(buildLayerTree(layer(['Push(constructor(HASH[aa]))'])).issues).toEqual([
      'Op 0 uses the unrecognized node variant constructor; it is drawn as an opaque sibling.',
    ]);
  });

  it('builds a very deep chain without recursion', () => {
    const ops = ['Push(Hash(HASH[00]))'];
    for (let i = 0; i < 40_000; i++) ops.push('Push(KVHash(HASH[11]))', 'Parent');
    const parsed = layer(ops);
    const { root, issues } = buildLayerTree(parsed);
    expect(issues).toEqual([]);
    expect(root?.op.index).toBe(79_999);
    expect(summarizeProof(parsed).totals.combine).toBe(40_000);
  });

  it('parses deeply nested layers without recursion', () => {
    const depth = 5_000;
    const lines: string[] = [];
    for (let i = 0; i < depth; i++) lines.push('LayerProof {', '  proof: Merk(', '    0: Push(Hash(HASH[aa])))', '  lower_layers: {', '    k => {');
    for (let i = 0; i < depth; i++) lines.push('    }', '  }', '}');
    const root = parseProofTree(lines.join('\n'))!;
    const layers = flattenLayers(root);
    expect(layers).toHaveLength(depth);
    expect(layers.at(-1)!.depth).toBe(depth - 1);
  });
});
