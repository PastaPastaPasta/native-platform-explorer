'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { useMemo } from 'react';

interface LayerStats {
  depth: number;
  /** parent key that opens this layer, hex-encoded (empty for the root layer) */
  parentKey: string;
  kv: number;
  kvValueHash: number;
  kvHash: number;
  hash: number;
  combine: number;
  /** A few sample data keys at this layer, for orientation. */
  sampleKeys: string[];
}

interface ProofStats {
  layers: LayerStats[];
  totals: {
    kv: number;
    kvValueHash: number;
    kvHash: number;
    hash: number;
    combine: number;
  };
}

/**
 * Parse the parsed-proof-tree text emitted by grovedb-proof-parser
 * (Rust Display impl) and extract per-layer statistics. The format we parse:
 *
 *   GroveDBProofV0 {
 *     LayerProof {
 *       merk_proof:
 *         0: Push(KV(0x..., Item(0x..)))
 *         1: Push(KVHash(HASH[...]))
 *         2: Parent
 *         ...
 *       lower_layers: {
 *         0x.. => {
 *           LayerProof { ... }
 *         }
 *       }
 *     }
 *   }
 *
 * We don't need a full parser — line-level pattern matching with brace
 * tracking is enough to count ops and discover nested layers.
 */
function parseProofStats(text: string): ProofStats {
  const lines = text.split('\n');
  // Stack of layers currently open; the last entry is the layer the current
  // line's ops belong to. A new layer is pushed whenever we see "LayerProof {",
  // and popped whenever indentation closes back out.
  const stack: { layer: LayerStats; pendingParentKey: string }[] = [];
  const all: LayerStats[] = [];

  const makeLayer = (depth: number, parentKey: string): LayerStats => ({
    depth,
    parentKey,
    kv: 0,
    kvValueHash: 0,
    kvHash: 0,
    hash: 0,
    combine: 0,
    sampleKeys: [],
  });

  let nextParentKey = '';

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('LayerProof {')) {
      const layer = makeLayer(stack.length, nextParentKey);
      stack.push({ layer, pendingParentKey: nextParentKey });
      all.push(layer);
      nextParentKey = '';
      continue;
    }

    if (line === '}') {
      stack.pop();
      continue;
    }

    // `0x.. => {` opens a nested layer block; capture the key as the
    // parent-key annotation for the next LayerProof we open.
    const childMatch = line.match(/^([0-9a-fA-Fx]+|x)\s*=>\s*\{/);
    if (childMatch) {
      nextParentKey = childMatch[1] ?? '';
      continue;
    }

    if (stack.length === 0) continue;
    const cur = stack[stack.length - 1]!.layer;

    if (line.includes('Push(KV(')) {
      cur.kv++;
      // Extract the key (hex string between Push(KV( and ,).
      const m = line.match(/Push\(KV\(([^,]+),/);
      if (m && cur.sampleKeys.length < 3) cur.sampleKeys.push(m[1]!);
    } else if (line.includes('Push(KVValueHash(')) {
      cur.kvValueHash++;
    } else if (line.includes('Push(KVRefValueHash(')) {
      cur.kvValueHash++;
    } else if (line.includes('Push(KVDigest(')) {
      cur.kvHash++;
    } else if (line.includes('Push(KVHash(')) {
      cur.kvHash++;
    } else if (line.includes('Push(Hash(')) {
      cur.hash++;
    } else if (line === 'Parent' || line === 'Child' || line === 'ParentInverted' || line === 'ChildInverted') {
      cur.combine++;
    }
  }

  const totals = all.reduce(
    (acc, l) => ({
      kv: acc.kv + l.kv,
      kvValueHash: acc.kvValueHash + l.kvValueHash,
      kvHash: acc.kvHash + l.kvHash,
      hash: acc.hash + l.hash,
      combine: acc.combine + l.combine,
    }),
    { kv: 0, kvValueHash: 0, kvHash: 0, hash: 0, combine: 0 },
  );

  return { layers: all, totals };
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  if (value === 0) return null;
  return (
    <Box flex="1" minW="140px">
      <Text fontSize="lg" color="gray.100" fontFamily="mono" lineHeight="1.2">
        {value}
      </Text>
      <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mt={0.5}>
        {label}
      </Text>
      <Text fontSize="2xs" color="gray.500" mt={0.5} lineHeight="1.4">
        {hint}
      </Text>
    </Box>
  );
}

function LegendRow({ symbol, name, body }: { symbol: string; name: string; body: string }) {
  return (
    <Box>
      <HStack spacing={2} align="baseline">
        <Text fontFamily="mono" fontSize="2xs" color="brand.light" minW="160px">
          {symbol}
        </Text>
        <Text fontSize="2xs" color="gray.300" fontWeight="600">
          {name}
        </Text>
      </HStack>
      <Text fontSize="2xs" color="gray.500" ml="160px" mt={0.5} lineHeight="1.5">
        {body}
      </Text>
    </Box>
  );
}

export function ProofExplainer({ text }: { text: string }) {
  const stats = useMemo(() => parseProofStats(text), [text]);
  if (stats.layers.length === 0) return null;

  const { totals, layers } = stats;
  const sigItems = totals.kv + totals.kvValueHash;
  const siblings = totals.kvHash + totals.hash;

  return (
    <VStack align="stretch" spacing={3} mb={3}>
      <Box bg="whiteAlpha.50" borderRadius="md" px={3} py={2.5}>
        <Text fontSize="xs" color="gray.300" lineHeight="1.6">
          A GroveDB proof is a list of stack operations that rebuilds the merkle
          path from the queried value(s) up to the state root. Verifying it means
          replaying the ops, hashing as you go, and checking that the final
          root hash matches the one the quorum signed.
        </Text>
      </Box>

      <HStack spacing={4} flexWrap="wrap" align="flex-start" px={1}>
        <Stat
          label="layers"
          value={layers.length}
          hint="GroveDB is a tree of trees. Each layer is a separate merkle subtree the proof descends through."
        />
        <Stat
          label="data items"
          value={sigItems}
          hint="Full key+value pairs this proof attests to. These are what the query actually returned."
        />
        <Stat
          label="sibling hashes"
          value={siblings}
          hint="Neighbor-node hashes we don't need the value of, but whose hash is required to compute the parent."
        />
        <Stat
          label="combine ops"
          value={totals.combine}
          hint="Parent/Child stack ops that glue pushed nodes into a tree shape during verification."
        />
      </HStack>

      <Box borderTop="1px solid" borderColor="gray.750" pt={3}>
        <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mb={2}>
          Layers (outer → inner)
        </Text>
        <VStack align="stretch" spacing={2}>
          {layers.map((layer, i) => (
            <Box
              key={i}
              pl={2}
              borderLeft="2px solid"
              borderColor={layer.kv > 0 ? 'brand.normal' : 'gray.700'}
            >
              <HStack spacing={2} align="baseline" flexWrap="wrap">
                <Text fontSize="xs" color="gray.200" fontWeight="600">
                  Layer {i + 1}
                </Text>
                {layer.parentKey ? (
                  <Text fontSize="2xs" color="gray.500" fontFamily="mono">
                    entered via key {layer.parentKey}
                  </Text>
                ) : (
                  <Text fontSize="2xs" color="gray.500">
                    root tree
                  </Text>
                )}
              </HStack>
              <Text fontSize="2xs" color="gray.400" mt={0.5}>
                {layer.kv > 0 ? `${layer.kv} data item${layer.kv === 1 ? '' : 's'} · ` : ''}
                {layer.kvValueHash > 0 ? `${layer.kvValueHash} subtree ref${layer.kvValueHash === 1 ? '' : 's'} · ` : ''}
                {layer.kvHash + layer.hash > 0 ? `${layer.kvHash + layer.hash} sibling hash${layer.kvHash + layer.hash === 1 ? '' : 'es'} · ` : ''}
                {layer.combine} combine op{layer.combine === 1 ? '' : 's'}
                {layer.kv === 0 && layer.kvValueHash > 0 ? ' — navigates to the next layer' : ''}
                {layer.kv > 0 ? ' — leaf data lives here' : ''}
              </Text>
              {layer.sampleKeys.length > 0 ? (
                <Text fontSize="2xs" color="gray.500" mt={0.5} fontFamily="mono" lineHeight="1.5" wordBreak="break-all">
                  e.g. {layer.sampleKeys.map((k) => k.length > 22 ? k.slice(0, 10) + '…' + k.slice(-8) : k).join('  ')}
                </Text>
              ) : null}
            </Box>
          ))}
        </VStack>
      </Box>

      <Box borderTop="1px solid" borderColor="gray.750" pt={3}>
        <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mb={2}>
          Reading the raw output
        </Text>
        <VStack align="stretch" spacing={2}>
          <LegendRow
            symbol="Push(KV(key, value))"
            name="data item"
            body="A full key/value pair the proof attests to. These are the values the query returned (or proves absent)."
          />
          <LegendRow
            symbol="Push(KVValueHash(…))"
            name="subtree reference"
            body="A node that holds a value AND links into a nested layer. The lower_layers entry below points to the actual subtree."
          />
          <LegendRow
            symbol="Push(KVHash(…)) / Push(KVDigest(…))"
            name="sibling (value omitted)"
            body="A neighbor whose hash we need to recompute the parent, but whose value we don't need. Keeps the proof small."
          />
          <LegendRow
            symbol="Push(Hash(…))"
            name="sibling (deep)"
            body="Same idea, even more compact: just the node hash, no key — used for nodes far from the query path."
          />
          <LegendRow
            symbol="Parent / Child"
            name="stack-combine op"
            body="Pop two items off the stack and combine them into a parent-child pair, hashing them together. This is how the verifier rebuilds the tree shape."
          />
          <LegendRow
            symbol="lower_layers: { key => … }"
            name="nested subtree"
            body="GroveDB stores trees inside trees. This block recurses into the subtree rooted at the given key."
          />
        </VStack>
      </Box>
    </VStack>
  );
}
