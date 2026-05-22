'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { minidenticon } from 'minidenticons';
import { useMemo } from 'react';
import { CopyButton } from '@ui/CopyButton';

export type IdentifierHighlight =
  | 'none'
  | 'dim'
  | 'highlight'
  | 'first'
  | 'last'
  | 'both';

export interface IdentifierProps {
  value: string;
  avatar?: boolean;
  copy?: boolean;
  ellipsis?: 'auto' | 'always' | 'never';
  highlight?: IdentifierHighlight;
  href?: string;
  as?: 'span' | 'div';
  dense?: boolean;
}

function splitId(value: string, ellipsis: IdentifierProps['ellipsis']) {
  const len = value.length;
  if (ellipsis === 'never' || len <= 14) return { head: value, mid: '', tail: '' };
  if (ellipsis === 'auto' && len <= 16) return { head: value, mid: '', tail: '' };
  return { head: value.slice(0, 5), mid: value.slice(5, -5), tail: value.slice(-5) };
}

function render(value: string, h: IdentifierHighlight, ellipsis: IdentifierProps['ellipsis']) {
  const { head, mid, tail } = splitId(value, ellipsis);
  if (h === 'dim') return <Text as="span" color="muted">{value}</Text>;
  if (h === 'highlight') return <Text as="span" color="ink">{value}</Text>;
  if (!mid) return <Text as="span" color="ink">{value}</Text>;
  const headColor = h === 'last' ? 'muted' : 'ink';
  // `muted` (not `faint`) — faint fails WCAG AA against both bg modes for text.
  const midColor = 'muted';
  const tailColor = h === 'first' ? 'muted' : 'ink';
  return (
    <>
      <Text as="span" color={headColor}>{head}</Text>
      <Text as="span" color={midColor}>{mid}</Text>
      <Text as="span" color={tailColor}>{tail}</Text>
    </>
  );
}

export function Identifier({
  value,
  avatar = false,
  copy = true,
  ellipsis = 'auto',
  highlight = 'both',
  href,
  as = 'span',
  dense = false,
}: IdentifierProps) {
  const svg = useMemo(() => (avatar ? minidenticon(value || 'null', 80, 60) : null), [value, avatar]);
  const svgDataUrl = useMemo(
    () => (svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null),
    [svg],
  );

  const body = (
    <HStack
      as={as}
      spacing={dense ? 1.5 : 2}
      display="inline-flex"
      fontFamily="mono"
      fontSize={dense ? '2xs' : 'xs'}
      alignItems="center"
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {svgDataUrl ? (
        <Box
          as="span"
          width={dense ? '16px' : '20px'}
          height={dense ? '16px' : '20px'}
          borderRadius="badge"
          bg="raised"
          border="1px solid"
          borderColor="hairline"
          backgroundImage={`url("${svgDataUrl}")`}
          backgroundSize="cover"
          flexShrink={0}
          aria-hidden
        />
      ) : null}
      <Box
        as="span"
        px={dense ? 1.5 : 2}
        py="2px"
        bg="raised"
        borderRadius="badge"
        border="1px solid"
        borderColor="hairline"
      >
        {render(value, highlight, ellipsis)}
      </Box>
      {copy ? <CopyButton value={value} label="Copy" /> : null}
    </HStack>
  );

  if (href) {
    return (
      <Box
        as={NextLink}
        href={href}
        display="inline-flex"
        _hover={{ filter: 'brightness(1.08)' }}
      >
        {body}
      </Box>
    );
  }
  return body;
}
