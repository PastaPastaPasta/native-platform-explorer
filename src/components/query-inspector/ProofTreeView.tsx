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

function ellipsize(s: string | undefined, head: number, tail: number): string {
  if (!s) return '';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const shortKey = (key: string | undefined): string => ellipsize(key, 10, 6);

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

  // Compact single-line primary label for the tree view; full detail is in
  // the tooltip. Keeps each node small enough that a wide binary tree fits
  // on screen.
  let primary: ReactNode = null;
  let tooltipText = '';

  if (node.kind === 'kv') {
    primary = (
      <Text as="span" color="gray.100" fontFamily="mono" fontSize="2xs">
        {shortKey(op.key)}
      </Text>
    );
    tooltipText = `DATA  #${op.index}\nkey:   ${op.key ?? '?'}\nvalue: ${op.value ?? '?'}`;
  } else if (node.kind === 'subtree') {
    primary = (
      <Text as="span" color="gray.100" fontFamily="mono" fontSize="2xs">
        {shortKey(op.key)}
      </Text>
    );
    tooltipText =
      `SUBTREE  #${op.index}\nkey:        ${op.key ?? '?'}\n` +
      `value:      ${op.treeValue ?? '?'}\nroot hash:  ${op.hash ?? '?'}`;
  } else {
    const kindLabel =
      op.kind === 'kvDigest' ? 'kv-digest' :
      op.kind === 'kvHash' ? 'kv-hash' :
      'hash';
    primary = (
      <Text as="span" color="gray.500" fontFamily="mono" fontSize="2xs">
        {ellipsize(op.hash, 4, 3)}
      </Text>
    );
    tooltipText = `SIBLING  #${op.index} (${kindLabel})\n${op.key ? `key:  ${op.key}\n` : ''}hash: ${op.hash ?? '?'}`;
  }

  return (
    <Tooltip
      label={<Box whiteSpace="pre" fontFamily="mono" fontSize="2xs">{tooltipText}</Box>}
      hasArrow
      placement="top"
      openDelay={300}
    >
      <Box
        display="inline-flex"
        flexDirection="column"
        bg={accent.bg}
        border="1px solid"
        borderColor={accent.border}
        borderRadius="md"
        px={2}
        py={1}
        cursor={onSubtreeClick ? 'pointer' : 'default'}
        onClick={onSubtreeClick}
        _hover={onSubtreeClick ? { bg: 'whiteAlpha.100', borderColor: 'blue.500' } : undefined}
        minW="92px"
        maxW="160px"
        textAlign="center"
        transition="background-color 0.1s"
      >
        <HStack spacing={1} align="center" justify="center">
          <Text fontSize="3xs" fontWeight="700" color={accent.color} letterSpacing="0.06em" lineHeight="1.1">
            {accent.label}
          </Text>
          <Text fontSize="3xs" color="gray.600" fontFamily="mono" lineHeight="1.1">#{op.index}</Text>
          {onSubtreeClick ? (
            <Icon as={subtreeOpen ? ChevronDownIcon : ChevronRightIcon} boxSize="9px" color="blue.300" />
          ) : null}
        </HStack>
        <Box mt={0.5}>{primary}</Box>
      </Box>
    </Tooltip>
  );
}

/* ----- Recursive binary tree renderer --------------------------------- */

function LayerHeader({ layer }: { layer: ParsedLayer }) {
  if (!layer.decodedParentKey?.description) return null;
  return (
    <Text fontSize="2xs" color="gray.500" mb={1.5} lineHeight="1.5">
      {layer.decodedParentKey.description}
    </Text>
  );
}

/**
 * Top-down binary tree renderer.
 *
 * Layout strategy: each node renders as a centered column —
 *   [ NodeCard ]
 *      |
 *   [ left | right ]   ← flex row of two child columns
 *
 * Connector lines are drawn with the `_before` and `_after` pseudo-elements:
 *   - A short vertical line drops from each parent's bottom to the row below.
 *   - Each child column has a half-width top border (right half for left
 *     children, left half for right children), so the two halves together
 *     form a single horizontal line under the parent connecting both children.
 *   - A vertical stub then drops from that horizontal line into the child card.
 *
 * For a single-child node, the layout still works (the row has only one
 * column, and the half-borders still align under the parent).
 *
 * `gap` between siblings widens with the larger subtree below; we set a
 * generous default so deep narrow trees stay readable and wide shallow trees
 * don't visually collide.
 */
function RenderTree({
  node,
  childrenMap,
  expandedSubtrees,
  onToggleSubtree,
}: {
  node: TreeNode;
  childrenMap: Map<string, ParsedLayer>;
  expandedSubtrees: Set<string>;
  onToggleSubtree: (k: string) => void;
}) {
  const childLayer = node.kind === 'subtree' && node.op?.key
    ? childrenMap.get(node.op.key)
    : undefined;
  const subtreeKey = childLayer ? node.op!.key! : undefined;
  const subtreeOpen = subtreeKey ? expandedSubtrees.has(subtreeKey) : false;
  const hasLeft = !!node.left;
  const hasRight = !!node.right;
  const hasAnyChild = hasLeft || hasRight;

  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      {/* Self */}
      <NodeCard
        node={node}
        onSubtreeClick={subtreeKey ? () => onToggleSubtree(subtreeKey) : undefined}
        subtreeOpen={subtreeKey ? subtreeOpen : undefined}
      />

      {/* Drop line from this node into the children row */}
      {hasAnyChild ? (
        <Box width="1px" height="12px" bg="gray.700" />
      ) : null}

      {/* Children row */}
      {hasAnyChild ? (
        <Box display="flex" alignItems="flex-start" gap={6} position="relative">
          {hasLeft ? (
            <ChildSlot label="L">
              <RenderTree
                node={node.left!}
                childrenMap={childrenMap}
                expandedSubtrees={expandedSubtrees}
                onToggleSubtree={onToggleSubtree}
              />
            </ChildSlot>
          ) : null}
          {hasRight ? (
            <ChildSlot label="R">
              <RenderTree
                node={node.right!}
                childrenMap={childrenMap}
                expandedSubtrees={expandedSubtrees}
                onToggleSubtree={onToggleSubtree}
              />
            </ChildSlot>
          ) : null}
        </Box>
      ) : null}

      {/* Nested layer (subtree expansion) */}
      {childLayer && subtreeOpen ? (
        <Box
          mt={3}
          p={3}
          bg="rgba(49,130,206,0.06)"
          border="1px solid"
          borderColor="blue.800"
          borderRadius="md"
          alignSelf="stretch"
          minW="280px"
        >
          <Text fontSize="2xs" color="blue.300" mb={1} fontWeight="700" textAlign="center">
            ↓ Layer {childLayer.layerIndex} · {contextLabel(childLayer.context)}
          </Text>
          <LayerHeader layer={childLayer} />
          <Box display="flex" justifyContent="center" mt={2}>
            <LayerTree layer={childLayer} autoExpand={false} />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Wraps a child of a binary node, drawing the connector arm from the parent's
 * dropline down into this child. The L/R label sits in the arm so it's easy
 * to see at a glance which slot the child fills.
 */
function ChildSlot({ label, children }: { label: 'L' | 'R'; children: ReactNode }) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" position="relative" pt="14px">
      {/* short vertical arm */}
      <Box
        position="absolute"
        top={0}
        left="50%"
        width="1px"
        height="14px"
        bg="gray.700"
        transform="translateX(-0.5px)"
      />
      <Text
        position="absolute"
        top="-2px"
        left="50%"
        transform="translateX(-50%)"
        fontSize="3xs"
        color={label === 'L' ? 'gray.500' : 'gray.500'}
        fontFamily="mono"
        fontWeight="700"
        bg="gray.900"
        px={1}
        lineHeight="1"
        pointerEvents="none"
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

/**
 * Hosts per-layer expansion state and renders the layer's reconstructed tree.
 *
 * `autoExpand` controls whether known child layers are open on mount. Only the
 * top-level proof opens its children automatically; deeper layers stay
 * collapsed so a 5-layer proof with hundreds of siblings per layer doesn't
 * try to mount thousands of node cards on the initial render.
 */
function LayerTree({ layer, autoExpand = true }: { layer: ParsedLayer; autoExpand?: boolean }) {
  const tree = useMemo(() => buildLayerTree(layer), [layer]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => (autoExpand ? new Set(layer.children.keys()) : new Set()),
  );
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
          <LayerTree layer={root} />
        </VStack>
      </Box>
    </Box>
  );
}
