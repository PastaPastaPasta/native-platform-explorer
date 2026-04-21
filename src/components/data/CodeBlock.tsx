'use client';

import { Box, Code, HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon } from '@chakra-ui/icons';
import { useMemo, useState } from 'react';
import { safeStringify } from '@util/wasm-json';

export interface CodeBlockProps {
  value: unknown;
  collapsedHeight?: number;
  collapsible?: boolean;
}

export function CodeBlock({ value, collapsedHeight = 240, collapsible = true }: CodeBlockProps) {
  const text = useMemo(() => safeStringify(value), [value]);
  const [open, setOpen] = useState(false);
  const long = text.split('\n').length > 20 || text.length > 2000;

  return (
    <Box position="relative" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.750">
      <HStack
        position="absolute"
        top={2}
        right={2}
        zIndex={2}
        bg="gray.800"
        borderRadius="md"
        px={1}
      >
        <Tooltip label="Copy" hasArrow>
          <IconButton
            aria-label="Copy"
            icon={<CopyIcon />}
            size="xs"
            variant="ghost"
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                void navigator.clipboard.writeText(text);
              }
            }}
          />
        </Tooltip>
        {collapsible && long ? (
          <Tooltip label={open ? 'Collapse' : 'Expand'} hasArrow>
            <IconButton
              aria-label="Toggle"
              icon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="xs"
              variant="ghost"
              onClick={() => setOpen((o) => !o)}
            />
          </Tooltip>
        ) : null}
      </HStack>
      <Code
        display="block"
        whiteSpace="pre"
        p={4}
        bg="gray.800"
        color="gray.100"
        fontFamily="mono"
        fontSize="xs"
        maxHeight={open || !collapsible || !long ? undefined : `${collapsedHeight}px`}
        overflow="auto"
      >
        {text}
      </Code>
    </Box>
  );
}
