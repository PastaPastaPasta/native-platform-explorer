'use client';

import { Box, Text, VStack, HStack } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import {
  buildLayerTree,
  parseProofTree,
  type OpNode,
  type ParsedLayer,
  type TreeNode,
} from './parse-proof-tree';
import { contextLabel } from './grovedb-schema';

/**
 * SVG-based binary tree renderer modeled on @dashpay/grovedb-proof-visualizer.
 * Inorder layout (x = inorder rank, y = depth) so each leaf gets its own
 * column and no nodes ever overlap. Cubic bezier edges connect parent to
 * children.
 */

const NODE_W = 220;
const NODE_H = 64;
const COL_GAP = 24;
const ROW_GAP = 56;
const PAD = 16;

type NodeClass = 'target' | 'descend' | 'internal' | 'opaque';

const NODE_STYLES: Record<NodeClass, { fill: string; stroke: string; textFill: string; secondaryFill: string }> = {
  target:   { fill: '#39c5cf', stroke: '#39c5cf', textFill: '#0d1117', secondaryFill: '#0d1117' },
  descend:  { fill: '#1f6feb', stroke: '#1f6feb', textFill: '#ffffff', secondaryFill: '#cfd9e8' },
  internal: { fill: '#1c2129', stroke: '#30363d', textFill: '#c9d1d9', secondaryFill: '#6e7681' },
  opaque:   { fill: '#6e7681', stroke: '#6e7681', textFill: '#ffffff', secondaryFill: '#dde2e7' },
};

function classifyNode(node: TreeNode): NodeClass {
  if (node.kind === 'kv') return 'target';
  if (node.kind === 'subtree') return 'descend';
  // sibling
  const op = node.op!;
  if (op.kind === 'hash') return 'opaque';
  // kvHash, kvDigest are internal siblings (we know the key)
  return 'internal';
}

function ellipsize(s: string | undefined, head: number, tail: number): string {
  if (!s) return '';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function nodeLabels(node: TreeNode): { primary: string; secondary?: string } {
  const op = node.op!;
  if (node.kind === 'kv') {
    return { primary: ellipsize(op.key, 8, 6), secondary: op.value ? ellipsize(op.value, 10, 8) : undefined };
  }
  if (node.kind === 'subtree') {
    return {
      primary: ellipsize(op.key, 8, 6),
      secondary: op.treeValue ? ellipsize(op.treeValue, 14, 6) : undefined,
    };
  }
  // sibling
  if (op.kind === 'hash') {
    return { primary: `HASH[${ellipsize(op.hash, 6, 4)}]` };
  }
  if (op.kind === 'kvHash') {
    return { primary: `KVHash[${ellipsize(op.hash, 6, 4)}]` };
  }
  // kvDigest
  return { primary: ellipsize(op.key, 8, 6), secondary: `HASH[${ellipsize(op.hash, 6, 4)}]` };
}

function nodeTooltip(node: TreeNode): string {
  const op = node.op!;
  const lines: string[] = [];
  lines.push(`${node.kind.toUpperCase()}  #${op.index} (${op.kind})`);
  if (op.key) lines.push(`key:        ${op.key}`);
  if (op.value) lines.push(`value:      ${op.value}`);
  if (op.treeValue) lines.push(`subtree:    ${op.treeValue}`);
  if (op.hash) lines.push(`hash:       ${op.hash}`);
  return lines.join('\n');
}

/* ----- Layout --------------------------------------------------------- */

interface Placement {
  node: TreeNode;
  col: number;
  depth: number;
  left?: Placement;
  right?: Placement;
}

interface Layout {
  placements: Placement[];
  width: number;
  height: number;
}

function computeLayout(root: TreeNode): Layout {
  const placements: Placement[] = [];
  let nextCol = 0;
  let maxDepth = 0;

  const walk = (node: TreeNode, depth: number): Placement => {
    if (depth > maxDepth) maxDepth = depth;
    let leftP: Placement | undefined;
    let rightP: Placement | undefined;
    if (node.left) leftP = walk(node.left, depth + 1);
    const p: Placement = { node, col: nextCol++, depth, left: leftP, right: rightP };
    placements.push(p);
    if (node.right) p.right = walk(node.right, depth + 1);
    return p;
  };
  walk(root, 0);

  const cols = nextCol;
  const rows = maxDepth + 1;
  const width = PAD * 2 + cols * NODE_W + Math.max(0, cols - 1) * COL_GAP;
  const height = PAD * 2 + rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;
  return { placements, width, height };
}

function colX(col: number): number {
  return PAD + col * (NODE_W + COL_GAP);
}
function rowY(row: number): number {
  return PAD + row * (NODE_H + ROW_GAP);
}
function centerXY(p: Placement): { cx: number; cy: number } {
  return { cx: colX(p.col) + NODE_W / 2, cy: rowY(p.depth) + NODE_H / 2 };
}

/* ----- SVG rendering ------------------------------------------------- */

function MerkTreeSVG({
  layout,
  childrenMap,
  expandedSubtrees,
  onToggleSubtree,
}: {
  layout: Layout;
  childrenMap: Map<string, ParsedLayer>;
  expandedSubtrees: Set<string>;
  onToggleSubtree: (key: string) => void;
}) {
  return (
    <svg
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ display: 'block', maxWidth: 'none' }}
    >
      {/* Edges first so node rects layer over them */}
      <g stroke="#484f58" strokeWidth={1.5} fill="none">
        {layout.placements.map((p) => {
          const segments: React.ReactNode[] = [];
          for (const child of [p.left, p.right]) {
            if (!child) continue;
            const a = centerXY(p);
            const b = centerXY(child);
            const x1 = a.cx, y1 = a.cy + NODE_H / 2;
            const x2 = b.cx, y2 = b.cy - NODE_H / 2;
            const cy = (y1 + y2) / 2;
            segments.push(
              <path key={`${p.col}-${child.col}`} d={`M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`} />,
            );
          }
          return segments;
        })}
      </g>

      {/* Nodes */}
      {layout.placements.map((p) => {
        const cls = classifyNode(p.node);
        const style = NODE_STYLES[cls];
        const { primary, secondary } = nodeLabels(p.node);
        const x = colX(p.col);
        const y = rowY(p.depth);
        const op = p.node.op!;
        const childLayer = p.node.kind === 'subtree' && op.key ? childrenMap.get(op.key) : undefined;
        const subtreeOpen = childLayer ? expandedSubtrees.has(op.key!) : false;
        const clickable = !!childLayer;

        return (
          <g
            key={p.col}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
            onClick={clickable ? () => onToggleSubtree(op.key!) : undefined}
          >
            <title>{nodeTooltip(p.node)}</title>
            <rect
              x={x}
              y={y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={cls === 'target' ? 2 : 1}
            />
            {/* Kind badge in upper-left */}
            <text
              x={x + 10}
              y={y + 14}
              fill={style.secondaryFill}
              opacity={0.75}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              fontSize={9}
              fontWeight={700}
              letterSpacing="0.08em"
            >
              {cls.toUpperCase()} #{op.index}{clickable ? (subtreeOpen ? '  ▾' : '  ▸') : ''}
            </text>
            {/* Primary label centered */}
            <text
              x={x + NODE_W / 2}
              y={y + (secondary ? 36 : 42)}
              fill={style.textFill}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
            >
              {primary}
            </text>
            {secondary ? (
              <text
                x={x + NODE_W / 2}
                y={y + 54}
                fill={style.secondaryFill}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                fontSize={11}
                textAnchor="middle"
              >
                {secondary}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ----- Layer + nesting ----------------------------------------------- */

function LayerPanel({ layer, autoExpand = true }: { layer: ParsedLayer; autoExpand?: boolean }) {
  const tree = useMemo(() => buildLayerTree(layer), [layer]);
  const layout = useMemo(() => (tree ? computeLayout(tree) : null), [tree]);
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

  if (!layout || !tree) {
    return <Text fontSize="2xs" color="gray.500">Could not reconstruct this layer&apos;s tree.</Text>;
  }

  // For each expanded subtree, find the matching nested layer to render.
  const expandedChildren: Array<{ key: string; child: ParsedLayer }> = [];
  for (const key of expanded) {
    const child = layer.children.get(key);
    if (child) expandedChildren.push({ key, child });
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Box bg="rgba(33,38,45,0.5)" border="1px solid" borderColor="#30363d" borderRadius="md" overflow="hidden">
        <HStack
          px={3}
          py={2}
          bg="rgba(28,33,41,0.7)"
          borderBottom="1px solid"
          borderColor="#30363d"
          spacing={3}
          flexWrap="wrap"
        >
          <Text fontSize="xs" color="gray.100" fontWeight="600">
            Layer {layer.layerIndex}
          </Text>
          <Text fontSize="2xs" color="blue.300" fontWeight="600">
            {contextLabel(layer.context)}
          </Text>
          {layer.decodedParentKey?.name ? (
            <Text fontSize="2xs" color="gray.400">
              entered via{' '}
              <Text as="span" fontFamily="mono" color="gray.200">{layer.decodedParentKey.raw}</Text>{' '}
              <Text as="span" color="gray.500">({layer.decodedParentKey.name})</Text>
            </Text>
          ) : null}
        </HStack>
        {layer.decodedParentKey?.description ? (
          <Text fontSize="2xs" color="gray.500" px={3} pt={2} lineHeight="1.5">
            {layer.decodedParentKey.description}
          </Text>
        ) : null}
        <Box overflowX="auto" overflowY="hidden" px={3} py={3}>
          <MerkTreeSVG
            layout={layout}
            childrenMap={layer.children}
            expandedSubtrees={expanded}
            onToggleSubtree={toggle}
          />
        </Box>
      </Box>

      {expandedChildren.map(({ key, child }) => (
        <Box key={key} ml={6}>
          <LayerPanel layer={child} autoExpand={false} />
        </Box>
      ))}
    </VStack>
  );
}

/* ----- Top-level ----------------------------------------------------- */

export function ProofTreeView({ text }: { text: string }) {
  const root = useMemo(() => parseProofTree(text), [text]);
  if (!root) return null;

  return (
    <Box>
      <Text fontSize="2xs" color="gray.500" mb={3} lineHeight="1.6">
        The binary merkle tree of each layer, reconstructed by replaying the
        proof&apos;s stack operations. Colored boxes:{' '}
        <Text as="span" color="#39c5cf" fontWeight="600">TARGET</Text> = data the query returned,{' '}
        <Text as="span" color="#1f6feb" fontWeight="600">DESCEND</Text> = subtree ref (click to expand the nested layer),{' '}
        <Text as="span" color="gray.300" fontWeight="600">INTERNAL</Text>/<Text as="span" color="#9aa4ac" fontWeight="600">OPAQUE</Text> = sibling hashes needed for verification.
      </Text>
      <LayerPanel layer={root} />
    </Box>
  );
}

// Help bundlers / TS treat OpNode import as intentional even if unused directly.
export type { OpNode };
