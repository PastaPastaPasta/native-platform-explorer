'use client';

import { Badge, Box, Collapse, HStack, Icon, Text, VStack } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useMemo, useState } from 'react';
import { parseProofTree, type OpNode, type ParsedLayer } from './parse-proof-tree';
import { contextLabel } from './grovedb-schema';

function shortHash(hex: string | undefined, head = 6, tail = 4): string {
  if (!hex) return '';
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function shortKey(key: string | undefined, head = 10, tail = 6): string {
  if (!key) return '';
  // Keep short keys (single chars, hex bytes) intact; only truncate long ones.
  if (key.length <= head + tail + 3) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/* ----- Op rows -------------------------------------------------------- */

function OpRow({ op, accent, label, body, badge }: {
  op: OpNode;
  accent: string;
  label: string;
  body: React.ReactNode;
  badge?: string;
}) {
  return (
    <HStack
      align="baseline"
      spacing={2}
      px={2}
      py={1}
      borderRadius="sm"
      _hover={{ bg: 'whiteAlpha.50' }}
    >
      <Text fontSize="2xs" color="gray.500" fontFamily="mono" minW="22px">
        {op.index}
      </Text>
      <Badge fontSize="2xs" colorScheme={accent} variant="subtle" minW="60px" textAlign="center">
        {label}
      </Badge>
      <Box flex="1" fontFamily="mono" fontSize="2xs" color="gray.200" wordBreak="break-all" lineHeight="1.5">
        {body}
      </Box>
      {badge ? (
        <Text fontSize="2xs" color="gray.500" fontStyle="italic">{badge}</Text>
      ) : null}
    </HStack>
  );
}

function DataItemRow({ op }: { op: OpNode }) {
  return (
    <OpRow
      op={op}
      accent="green"
      label="data"
      body={
        <>
          <Text as="span" color="gray.100">{shortKey(op.key)}</Text>
          <Text as="span" color="gray.500"> → </Text>
          <Text as="span" color="gray.300">{op.value ?? ''}</Text>
        </>
      }
    />
  );
}

function SubtreeRefRow({ op, hasChild }: { op: OpNode; hasChild: boolean }) {
  return (
    <OpRow
      op={op}
      accent="blue"
      label="subtree"
      body={
        <>
          <Text as="span" color="gray.100">key {shortKey(op.key)}</Text>
          <Text as="span" color="gray.500"> → </Text>
          <Text as="span" color="brand.light">{op.treeValue ?? 'Tree'}</Text>
          <Text as="span" color="gray.500"> (root hash {shortHash(op.hash)})</Text>
        </>
      }
      badge={hasChild ? 'see nested layer below' : 'subtree not in proof'}
    />
  );
}

function SiblingRow({ op }: { op: OpNode }) {
  const kindLabel =
    op.kind === 'kvDigest' ? 'kv-digest' :
    op.kind === 'kvHash' ? 'kv-hash' :
    'hash';
  return (
    <OpRow
      op={op}
      accent="gray"
      label="sibling"
      body={
        <>
          <Text as="span" color="gray.500">{kindLabel}</Text>
          {op.key ? <><Text as="span" color="gray.500"> at </Text><Text as="span" color="gray.400">{shortKey(op.key)}</Text></> : null}
          <Text as="span" color="gray.500"> hash </Text>
          <Text as="span" color="gray.400">{shortHash(op.hash)}</Text>
        </>
      }
    />
  );
}

function CombineRow({ op }: { op: OpNode }) {
  return (
    <OpRow
      op={op}
      accent="purple"
      label="combine"
      body={
        <Text as="span" color="gray.400">
          {op.combine} — pops two stack items, hashes them as parent+child
        </Text>
      }
    />
  );
}

/* ----- Section toggle ------------------------------------------------- */

function Toggle({
  open, onClick, label, count, accent,
}: {
  open: boolean; onClick: () => void; label: string; count: number; accent?: string;
}) {
  return (
    <HStack
      as="button"
      type="button"
      spacing={1.5}
      px={2}
      py={1}
      cursor="pointer"
      onClick={onClick}
      _hover={{ bg: 'whiteAlpha.50' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'brand.normal', outlineOffset: '-2px' }}
      borderRadius="sm"
      bg="transparent"
      border="none"
      textAlign="left"
      aria-expanded={open}
    >
      <Icon
        as={open ? ChevronDownIcon : ChevronRightIcon}
        boxSize="14px"
        color="gray.400"
      />
      <Text fontSize="2xs" color={accent ?? 'gray.400'} fontWeight="600" textTransform="uppercase">
        {label} ({count})
      </Text>
    </HStack>
  );
}

/* ----- Layer card ----------------------------------------------------- */

function LayerView({ layer, depth = 0 }: { layer: ParsedLayer; depth?: number }) {
  const dataOps = layer.ops.filter((o) => o.kind === 'kv');
  const subtreeOps = layer.ops.filter((o) => o.kind === 'kvValueHash' || o.kind === 'kvRefValueHash');
  const siblingOps = layer.ops.filter((o) => o.kind === 'kvHash' || o.kind === 'kvDigest' || o.kind === 'hash');
  const combineOps = layer.ops.filter((o) => o.kind === 'combine');

  // Sibling lists can be huge (200+ entries); collapse by default.
  // Combine ops are mechanical and rarely interesting; collapse by default too.
  const [showSiblings, setShowSiblings] = useState(false);
  const [showCombines, setShowCombines] = useState(false);

  return (
    <Box
      borderLeft="2px solid"
      borderColor={dataOps.length > 0 ? 'brand.normal' : 'gray.750'}
      pl={3}
      mb={2}
    >
      <HStack spacing={2} align="baseline" flexWrap="wrap" mb={1}>
        <Text fontSize="xs" color="gray.100" fontWeight="600">
          Layer {layer.layerIndex}
        </Text>
        <Text fontSize="2xs" color="brand.light" fontWeight="600">
          {contextLabel(layer.context)}
        </Text>
        {layer.decodedParentKey?.name ? (
          <Text fontSize="2xs" color="gray.400">
            via <Text as="span" fontFamily="mono" color="gray.300">{layer.decodedParentKey.raw}</Text>{' '}
            <Text as="span" color="gray.500">({layer.decodedParentKey.name})</Text>
          </Text>
        ) : layer.parentKey ? (
          <Text fontSize="2xs" color="gray.500" fontFamily="mono">
            via {shortKey(layer.parentKey)}
          </Text>
        ) : null}
      </HStack>

      {layer.decodedParentKey?.description ? (
        <Text fontSize="2xs" color="gray.500" mb={1.5} lineHeight="1.5">
          {layer.decodedParentKey.description}
        </Text>
      ) : null}

      <VStack align="stretch" spacing={0}>
        {/* Data items — always visible, the most important rows */}
        {dataOps.map((op) => <DataItemRow key={op.index} op={op} />)}

        {/* Subtree refs — always visible, each linked to nested layer */}
        {subtreeOps.map((op) => {
          const child = op.key ? layer.children.get(op.key) : undefined;
          return (
            <Box key={op.index}>
              <SubtreeRefRow op={op} hasChild={!!child} />
              {child ? (
                <Box ml={4} mt={1} mb={1}>
                  <LayerView layer={child} depth={depth + 1} />
                </Box>
              ) : null}
            </Box>
          );
        })}

        {/* Siblings — collapsible group */}
        {siblingOps.length > 0 ? (
          <>
            <Toggle
              open={showSiblings}
              onClick={() => setShowSiblings((o) => !o)}
              label="sibling hashes"
              count={siblingOps.length}
            />
            <Collapse in={showSiblings} animateOpacity>
              {siblingOps.map((op) => <SiblingRow key={op.index} op={op} />)}
            </Collapse>
          </>
        ) : null}

        {/* Combine ops — collapsible group */}
        {combineOps.length > 0 ? (
          <>
            <Toggle
              open={showCombines}
              onClick={() => setShowCombines((o) => !o)}
              label="combine ops"
              count={combineOps.length}
            />
            <Collapse in={showCombines} animateOpacity>
              {combineOps.map((op) => <CombineRow key={op.index} op={op} />)}
            </Collapse>
          </>
        ) : null}
      </VStack>
    </Box>
  );
}

/* ----- Top-level -----------------------------------------------------*/

export function ProofTreeView({ text }: { text: string }) {
  const tree = useMemo(() => parseProofTree(text), [text]);
  if (!tree) return null;

  return (
    <Box>
      <Text fontSize="2xs" color="gray.500" mb={2} lineHeight="1.5">
        Each layer is a GroveDB subtree. Subtree references point into nested
        layers, shown indented underneath. Sibling hashes are needed for
        verification but aren&apos;t the data you queried — collapsed by default.
      </Text>
      <LayerView layer={tree} />
    </Box>
  );
}
