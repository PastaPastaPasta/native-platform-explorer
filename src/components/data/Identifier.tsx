'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { minidenticon } from 'minidenticons';
import { useMemo, type HTMLAttributes } from 'react';
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
  /** Accessible name of the copy button. Defaults to one derived from `href`,
   *  e.g. "Copy identity ID". */
  copyLabel?: string;
  /** Extra props for the link, e.g. prefetch handlers. */
  linkProps?: HTMLAttributes<HTMLElement>;
}

const COPY_LABELS: Array<[RegExp, string]> = [
  [/^\/identity\/lookup\//, 'Copy public-key hash'],
  [/^\/identity\//, 'Copy identity ID'],
  [/^\/contract\//, 'Copy contract ID'],
  [/^\/token\//, 'Copy token ID'],
  [/^\/evonode\//, 'Copy proTxHash'],
  [/^\/address\//, 'Copy address'],
  [/^\/state-transition\//, 'Copy state transition hash'],
  [/^\/groups\//, 'Copy contract ID'],
];

export function copyLabelFor(href: string | undefined): string {
  if (href) {
    for (const [pattern, label] of COPY_LABELS) if (pattern.test(href)) return label;
  }
  return 'Copy identifier';
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
  copyLabel,
  linkProps,
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
      maxW="100%"
      minW={0}
      fontFamily="mono"
      fontSize={dense ? '2xs' : 'xs'}
      alignItems="center"
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {svgDataUrl ? (
        // An <img>, not `backgroundImage`: Chakra parses that prop as a
        // gradient and drops a data URL containing parentheses (hsl() fill).
        <Box
          as="img"
          src={svgDataUrl}
          alt=""
          width={dense ? '16px' : '20px'}
          height={dense ? '16px' : '20px'}
          borderRadius="badge"
          bg="raised"
          border="1px solid"
          borderColor="hairline"
          objectFit="cover"
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
        minW={0}
        // Long hashes wrap instead of widening the page on narrow screens.
        wordBreak="break-all"
      >
        {render(value, highlight, ellipsis)}
      </Box>
      {copy ? <CopyButton value={value} label={copyLabel ?? copyLabelFor(href)} /> : null}
    </HStack>
  );

  if (href) {
    return (
      <Box
        as={NextLink}
        href={href}
        display="inline-flex"
        maxW="100%"
        minW={0}
        _hover={{ filter: 'brightness(1.08)' }}
        {...linkProps}
      >
        {body}
      </Box>
    );
  }
  return body;
}
