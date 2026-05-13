'use client';

import { Box, HStack, Icon, Text, Tooltip, VStack } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useMemo, useState, type ReactNode } from 'react';
import {
  buildLayerTree,
  parseProofTree,
  type ParsedLayer,
  type TreeNode,
} from './parse-proof-tree';
import { contextLabel } from './grovedb-schema';

function shortHash(hex: string | undefined, head = 6, tail = 4): string {
  if (!hex) return '';
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function shortKey(key: string | undefined, head = 10, tail = 6): string {
  if (!key) return '';
  if (key.length <= head + tail + 3) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/* ----- Node card ------------------------------------------------------ */

const ACCENT: Record<TreeNode['kind'], { color: string; bg: string; border: string; label: string }> = {
  kv:      { color: 'green.200', bg: 'rgba(56,161,105,0.10)', border: 'green.700',  label: 'DATA' },
  subtree: { color: 'blue.200',  bg: 'rgba(49,130,206,0.10)', border: 'blue.700',   label: 'SUBTREE' },
  sibling: { color: 'gray.400',  bg: 'rgba(255,255,255,0.03)', border: 'gray.700',  label: 'SIBLING' },
};

function NodeCard({ node, onSubtreeClick, subtreeOpen }: {
  node: TreeNode;
  onSubtreeClick?: () => void;
  subtreeOpen?: boolean;
}) {
  const op = node.op!;
  const accent = ACCENT[node.kind];

  let primary: ReactNode = null;
  let secondary: ReactNode = null;
  let tooltip = '';

  if (node.kind === 'kv') {
    primary = (
      <>
        <Text as="span" color="gray.100" fontFamily="mono">{shortKey(op.key)}</Text>
        <Text as="span" color="gray.500" mx={1}>→</Text>
        <Text as="span" color="gray.300" fontFamily="mono">{op.value ?? ''}</Text>
      </>
    );
    tooltip = `${op.key}\n${op.value ?? ''}`;
  } else if (node.kind === 'subtree') {
    primary = (
      <>
        <Text as="span" color="gray.100" fontFamily="mono">key {shortKey(op.key)}</Text>
        <Text as="span" color="gray.500" mx={1}>→</Text>
        <Text as="span" color="brand.light" fontFamily="mono">{op.treeValue ?? 'Tree'}</Text>
      </>
    );
    secondary = (
      <Text fontSize="2xs" color="gray.500" fontFamily="mono">
        root hash {shortHash(op.hash)}
      </Text>
    );
    tooltip = `${op.key}\nroot hash: ${op.hash ?? '?'}`;
  } else {
    const kindLabel =
      op.kind === 'kvDigest' ? 'kv-digest' :
      op.kind === 'kvHash' ? 'kv-hash' :
      'hash';
    primary = (
      <>
        <Text as="span" color="gray.400" fontFamily="mono">{kindLabel}</Text>
        {op.key ? (
          <>
            <Text as="span" color="gray.500" mx={1}>at</Text>
            <Text as="span" color="gray.300" fontFamily="mono">{shortKey(op.key)}</Text>
          </>
        ) : null}
      </>
    );
    secondary = (
      <Text fontSize="2xs" color="gray.500" fontFamily="mono">
        {shortHash(op.hash)}
      </Text>
    );
    tooltip = `${kindLabel}: ${op.hash ?? '?'}`;
  }

  return (
    <Tooltip label={<Box whiteSpace="pre" fontFamily="mono" fontSize="2xs">{tooltip}</Box>} hasArrow placement="top">
      <Box
        display="inline-block"
        bg={accent.bg}
        borderLeft="3px solid"
        borderColor={accent.border}
        borderRadius="sm"
        px={2}
        py={1}
        fontSize="2xs"
        lineHeight="1.4"
        cursor={onSubtreeClick ? 'pointer' : 'default'}
        onClick={onSubtreeClick}
        _hover={onSubtreeClick ? { bg: 'whiteAlpha.100' } : undefined}
      >
        <HStack spacing={1.5} align="baseline">
          <Text fontSize="2xs" fontWeight="700" color={accent.color} letterSpacing="0.05em">
            {accent.label}
          </Text>
          {onSubtreeClick ? (
            <Icon as={subtreeOpen ? ChevronDownIcon : ChevronRightIcon} boxSize="10px" color="blue.300" />
          ) : null}
          <Text fontSize="2xs" color="gray.500" fontFamily="mono">#{op.index}</Text>
        </HStack>
        <Box mt={0.5}>{primary}</Box>
        {secondary ? <Box mt={0.5}>{secondary}</Box> : null}
      </Box>
    </Tooltip>
  );
}

/* ----- Recursive binary tree renderer --------------------------------- */
/**
 * Walks the reconstructed merkle tree, wiring up child-layer lookups at
 * every subtree ref so a single click expands the nested layer inline.
 * Indentation expresses tree depth; each child row draws an L-shaped
 * connector back to its parent via absolutely-positioned borders.
 */
function RenderTree({
  node,
  childrenMap,
  expandedSubtrees,
  onToggleSubtree,
  isRoot,
  isLeft,
}: {
  node: TreeNode;
  childrenMap: Map<string, ParsedLayer>;
  expandedSubtrees: Set<string>;
  onToggleSubtree: (k: string) => void;
  isRoot?: boolean;
  isLeft?: boolean;
}) {
  const childLayer = node.kind === 'subtree' && node.op?.key
    ? childrenMap.get(node.op.key)
    : undefined;

  return (
    <Box position="relative" pl={isRoot ? 0 : 6} mt={isRoot ? 0 : 1}>
      {!isRoot ? (
        <>
          <Box
            position="absolute"
            left={0}
            top={0}
            width="22px"
            height="14px"
            borderLeft="1px solid"
            borderBottom="1px solid"
            borderColor="gray.700"
            borderBottomLeftRadius="md"
          />
          <Text
            position="absolute"
            left="6px"
            top="-3px"
            fontSize="3xs"
            color="gray.600"
            fontFamily="mono"
            pointerEvents="none"
          >
            {isLeft ? 'L' : 'R'}
          </Text>
        </>
      ) : null}

      <NodeCard
        node={node}
        onSubtreeClick={childLayer ? () => onToggleSubtree(node.op!.key!) : undefined}
        subtreeOpen={childLayer ? expandedSubtrees.has(node.op!.key!) : undefined}
      />

      {node.left ? (
        <RenderTree
          node={node.left}
          childrenMap={childrenMap}
          expandedSubtrees={expandedSubtrees}
          onToggleSubtree={onToggleSubtree}
          isLeft
        />
      ) : null}
      {node.right ? (
        <RenderTree
          node={node.right}
          childrenMap={childrenMap}
          expandedSubtrees={expandedSubtrees}
          onToggleSubtree={onToggleSubtree}
          isLeft={false}
        />
      ) : null}

      {childLayer && expandedSubtrees.has(node.op!.key!) ? (
        <Box mt={2} ml={6} pl={3} borderLeft="2px dashed" borderColor="blue.700">
          <Text fontSize="2xs" color="blue.300" mb={1} fontWeight="600">
            ↓ Layer {childLayer.layerIndex} ({contextLabel(childLayer.context)})
          </Text>
          <LayerHeader layer={childLayer} />
          <RenderTreeWrapper layer={childLayer} />
        </Box>
      ) : null}
    </Box>
  );
}

function LayerHeader({ layer }: { layer: ParsedLayer }) {
  if (!layer.decodedParentKey?.description) return null;
  return (
    <Text fontSize="2xs" color="gray.500" mb={1.5} lineHeight="1.5">
      {layer.decodedParentKey.description}
    </Text>
  );
}

function RenderTreeWrapper({ layer }: { layer: ParsedLayer }) {
  const tree = useMemo(() => buildLayerTree(layer), [layer]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(layer.children.keys()));
  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  if (!tree) return null;
  return (
    <RenderTree
      node={tree}
      childrenMap={layer.children}
      expandedSubtrees={expanded}
      onToggleSubtree={toggle}
      isRoot
    />
  );
}

/* ----- Top-level -----------------------------------------------------*/

export function ProofTreeView({ text }: { text: string }) {
  const root = useMemo(() => parseProofTree(text), [text]);
  if (!root) return null;

  return (
    <Box>
      <Text fontSize="2xs" color="gray.500" mb={3} lineHeight="1.6">
        The actual binary merkle tree reconstructed by replaying the proof&apos;s
        stack operations. Each box is one node from a <Text as="span" fontFamily="mono">Push</Text> op;
        the <Text as="span" fontFamily="mono">L</Text>/<Text as="span" fontFamily="mono">R</Text> labels
        indicate left/right child slots. Click a <Text as="span" color="blue.300">SUBTREE</Text>{' '}
        node to expand or collapse its nested layer.
      </Text>
      <Box bg="rgba(0,0,0,0.2)" borderRadius="md" p={3} overflowX="auto">
        <VStack align="stretch" spacing={2}>
          <HStack spacing={2} align="baseline" flexWrap="wrap">
            <Text fontSize="xs" color="gray.100" fontWeight="600">
              Layer {root.layerIndex}
            </Text>
            <Text fontSize="2xs" color="brand.light" fontWeight="600">
              {contextLabel(root.context)}
            </Text>
          </HStack>
          <LayerHeader layer={root} />
          <RenderTreeWrapper layer={root} />
        </VStack>
      </Box>
    </Box>
  );
}
