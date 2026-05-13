'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { useMemo } from 'react';
import { contextLabel, decodeGroveKey, type DecodedKey, type GroveContext } from './grovedb-schema';

interface LayerStats {
  depth: number;
  /** parent key that opens this layer, hex-encoded (empty for the root layer) */
  parentKey: string;
  /** Decoded form of `parentKey`, resolved against the parent layer's context. */
  decodedParentKey?: DecodedKey;
  /** What GroveDB context this layer IS — used to decode the *next* layer's parent key. */
  context: GroveContext;
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
  // Track ALL open `{` blocks, tagging which ones are LayerProof blocks. A
  // single `}` line could close any of: the outer GroveDBProofV0 wrapper,
  // a `lower_layers: {` block, a `<key> => {` opener, or an actual LayerProof.
  // Popping the layer stack on every `}` (as a previous implementation did)
  // misattributes ops to the wrong layer in multi-layer proofs.
  const blockStack: Array<{ isLayer: boolean; layer?: LayerStats }> = [];
  const all: LayerStats[] = [];

  const makeLayer = (
    depth: number,
    parentKey: string,
    decodedParentKey: DecodedKey | undefined,
    context: GroveContext,
  ): LayerStats => ({
    depth,
    parentKey,
    decodedParentKey,
    context,
    kv: 0,
    kvValueHash: 0,
    kvHash: 0,
    hash: 0,
    combine: 0,
    sampleKeys: [],
  });

  const currentLayer = (): LayerStats | undefined => {
    for (let i = blockStack.length - 1; i >= 0; i--) {
      const frame = blockStack[i]!;
      if (frame.isLayer) return frame.layer;
    }
    return undefined;
  };

  let nextParentKey = '';

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('LayerProof {')) {
      // Determine this layer's context based on the parent layer's context +
      // the key that opened this block. Layer 1 has no parent and is always
      // the root tree itself.
      const parentLayer = (() => {
        for (let i = blockStack.length - 1; i >= 0; i--) {
          if (blockStack[i]!.isLayer) return blockStack[i]!.layer!;
        }
        return undefined;
      })();
      let context: GroveContext;
      let decoded: DecodedKey | undefined;
      if (!parentLayer) {
        context = 'root';
      } else {
        decoded = decodeGroveKey(nextParentKey, parentLayer.context);
        context = decoded.nextContext ?? 'unknown';
      }
      const layer = makeLayer(all.length, nextParentKey, decoded, context);
      blockStack.push({ isLayer: true, layer });
      all.push(layer);
      nextParentKey = '';
      continue;
    }

    if (line === '}') {
      blockStack.pop();
      continue;
    }

    // `<key> => {` opens a non-layer block; remember the key for the next
    // LayerProof we open inside it. (The regex's `[0-9a-fA-Fx]+` already
    // covers the literal `x` placeholder the parser uses for unprintable keys.)
    const childMatch = line.match(/^([0-9a-fA-Fx]+)\s*=>\s*\{/);
    if (childMatch) {
      nextParentKey = childMatch[1] ?? '';
      blockStack.push({ isLayer: false });
      continue;
    }

    // Any other line that opens a `{` block (GroveDBProofV0, lower_layers,
    // etc.) — push a non-layer frame so the matching `}` doesn't pop a real
    // layer.
    if (line.endsWith('{')) {
      blockStack.push({ isLayer: false });
      continue;
    }

    const cur = currentLayer();
    if (!cur) continue;

    if (line.includes('Push(KV(')) {
      cur.kv++;
      // Extract the key (hex string between Push(KV( and ,).
      const m = line.match(/Push\(KV\(([^,]+),/);
      if (m && cur.sampleKeys.length < 3) cur.sampleKeys.push(m[1]!);
    } else if (line.includes('Push(KVValueHash(') || line.includes('Push(KVRefValueHash(')) {
      cur.kvValueHash++;
    } else if (line.includes('Push(KVDigest(') || line.includes('Push(KVHash(')) {
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

function plural(count: number, singular: string, pluralForm = singular + 's'): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function layerSummary(layer: LayerStats): string {
  const siblings = layer.kvHash + layer.hash;
  const parts: string[] = [];
  if (layer.kv > 0) parts.push(plural(layer.kv, 'data item'));
  if (layer.kvValueHash > 0) parts.push(plural(layer.kvValueHash, 'subtree ref'));
  if (siblings > 0) parts.push(plural(siblings, 'sibling hash', 'sibling hashes'));
  parts.push(plural(layer.combine, 'combine op'));
  let suffix = '';
  if (layer.kv > 0 && layer.kvValueHash > 0) suffix = ' — holds data and navigates further';
  else if (layer.kv > 0) suffix = ' — leaf data lives here';
  else if (layer.kvValueHash > 0) suffix = ' — navigates to the next layer';
  return parts.join(' · ') + suffix;
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
                <Text fontSize="2xs" color="brand.light" fontWeight="600">
                  {contextLabel(layer.context)}
                </Text>
                {layer.decodedParentKey?.name ? (
                  <Text fontSize="2xs" color="gray.300">
                    via{' '}
                    <Text as="span" fontFamily="mono">{layer.decodedParentKey.raw}</Text>
                    {' '}
                    <Text as="span" color="gray.500">({layer.decodedParentKey.name})</Text>
                  </Text>
                ) : layer.parentKey ? (
                  <Text fontSize="2xs" color="gray.500" fontFamily="mono">
                    via {layer.parentKey}
                  </Text>
                ) : null}
              </HStack>
              {layer.decodedParentKey?.description ? (
                <Text fontSize="2xs" color="gray.500" mt={0.5} lineHeight="1.5">
                  {layer.decodedParentKey.description}
                </Text>
              ) : null}
              <Text fontSize="2xs" color="gray.400" mt={0.5}>
                {layerSummary(layer)}
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
