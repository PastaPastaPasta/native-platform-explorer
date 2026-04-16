'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import { minidenticon } from 'minidenticons';
import { useMemo } from 'react';
import { CopyButton } from './CopyButton';

export type IdentifierHighlight =
  | 'default'
  | 'dim'
  | 'highlight'
  | 'highlight-first'
  | 'highlight-last'
  | 'highlight-both';

export interface IdentifierProps {
  value: string;
  avatar?: boolean;
  copyButton?: boolean;
  highlight?: IdentifierHighlight;
  ellipsis?: boolean;
}

function splitId(value: string, ellipsis: boolean): { head: string; mid: string; tail: string } {
  if (!ellipsis || value.length <= 14) return { head: value, mid: '', tail: '' };
  return { head: value.slice(0, 5), mid: value.slice(5, -5), tail: value.slice(-5) };
}

function renderParts(value: string, highlight: IdentifierHighlight, ellipsis: boolean) {
  const { head, mid, tail } = splitId(value, ellipsis);
  if (highlight === 'dim') {
    return <Text as="span" color="gray.250">{value}</Text>;
  }
  if (highlight === 'highlight') {
    return <Text as="span" color="gray.100">{value}</Text>;
  }
  if (!mid) {
    return <Text as="span" color="gray.100">{value}</Text>;
  }
  const headColor = highlight === 'highlight-last' ? 'gray.250' : 'gray.100';
  const midColor = highlight === 'highlight-both' || highlight === 'default' ? 'gray.400' : 'gray.250';
  const tailColor = highlight === 'highlight-first' ? 'gray.250' : 'gray.100';
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
  avatar = true,
  copyButton = true,
  highlight = 'default',
  ellipsis = true,
}: IdentifierProps) {
  const svg = useMemo(() => (avatar ? minidenticon(value || 'null', 80, 60) : null), [value, avatar]);
  const svgDataUrl = useMemo(
    () => (svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null),
    [svg],
  );

  return (
    <HStack spacing={2} as="span" display="inline-flex" fontFamily="mono" fontSize="xs">
      {svgDataUrl ? (
        <Box
          as="span"
          width="24px"
          height="24px"
          borderRadius="6px"
          bg="gray.750"
          backgroundImage={`url("${svgDataUrl}")`}
          backgroundSize="cover"
          flexShrink={0}
        />
      ) : null}
      <Box as="span" px={2} py={1} bg="gray.800" borderRadius="10px">
        {renderParts(value, highlight, ellipsis)}
      </Box>
      {copyButton ? <CopyButton value={value} label="Copy identifier" /> : null}
    </HStack>
  );
}
