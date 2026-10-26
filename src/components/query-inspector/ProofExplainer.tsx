'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { useMemo } from 'react';
import { contextLabel } from './grovedb-schema';
import { parseProofTree, summarizeProof, type ProofLayerSummary } from './parse-proof-tree';

function plural(count: number, singular: string, pluralForm = singular + 's'): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function layerSummary(layer: ProofLayerSummary): string {
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
  // Statistics come from the same parse the tree view draws, so PushInverted
  // ops, printable keys and the V0/V1 layouts are counted consistently.
  const stats = useMemo(() => summarizeProof(parseProofTree(text)), [text]);
  if (stats.layers.length === 0) return null;

  const { totals, layers } = stats;
  const siblings = totals.kvHash + totals.hash;

  return (
    <VStack align="stretch" spacing={3} mb={3}>
      <Box bg="sunken" borderRadius="md" px={3} py={2.5}>
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
          value={totals.kv}
          hint="Full key+value pairs this proof attests to. These are what the query actually returned."
        />
        <Stat
          label="subtree refs"
          value={totals.kvValueHash}
          hint="Nodes holding a nested tree. The proof descends through them into the next layer."
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
          {layers.map(({ layer, ...counts }, i) => (
            <Box
              key={i}
              pl={2}
              borderLeft="2px solid"
              borderColor={counts.kv > 0 ? 'brand.normal' : 'gray.700'}
            >
              <HStack spacing={2} align="baseline" flexWrap="wrap">
                <Text fontSize="xs" color="gray.200" fontWeight="600">
                  Layer {layer.layerIndex}
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
                {layerSummary({ layer, ...counts })}
              </Text>
              {counts.issues.length > 0 ? (
                <Text fontSize="2xs" color="orange.200" mt={0.5}>
                  Tree incomplete or malformed ({plural(counts.issues.length, 'issue')}).
                </Text>
              ) : null}
              {counts.sampleKeys.length > 0 ? (
                <Text fontSize="2xs" color="gray.500" mt={0.5} fontFamily="mono" lineHeight="1.5" wordBreak="break-all">
                  e.g. {counts.sampleKeys.map((k) => k.length > 22 ? k.slice(0, 10) + '…' + k.slice(-8) : k).join('  ')}
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
            body="A full key/value pair the proof attests to. These are the values the query returned (or proves absent). KVRefValueHash is the same for a reference, carrying the value it resolves to."
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
            symbol="…Count(…) / …Sum(…) / HashWith…(…)"
            name="count / sum tree node"
            body="In provable count and sum trees every node also commits to the count and/or sum of its subtree, so each variant above has a Count, Sum or CountSum form carrying that total (KVSum is a data item, KVDigestSum and KVHashSum are siblings). HashWithCount / HashWithSum / HashWithCountAndSum stand in for a whole subtree inside an aggregate query's range, so the proof need not list its elements."
          />
          <LegendRow
            symbol="Parent / Child"
            name="stack-combine op"
            body="Pop two items off the stack and combine them into a parent-child pair, hashing them together. This is how the verifier rebuilds the tree shape."
          />
          <LegendRow
            symbol="PushInverted / …Inverted"
            name="descending order"
            body="The same operations for a proof walked right to left, as produced by ORDER BY … DESC queries. The Inverted combine ops attach children on the opposite side."
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
