'use client';

import { useState } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { CodeBlock } from './CodeBlock';

/** Raw JSON behind a toggle; the CodeBlock is only rendered once opened. */
export function RawJsonDisclosure({ value, label = 'Raw JSON' }: { value: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button
        size="xs"
        variant="ghost"
        leftIcon={open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {label}
      </Button>
      {open ? (
        <Box mt={2}>
          <CodeBlock value={value} />
        </Box>
      ) : null}
    </Box>
  );
}
