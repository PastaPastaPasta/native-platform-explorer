'use client';

import { IconButton, Tooltip, useToast } from '@chakra-ui/react';
import { CopyIcon } from '@chakra-ui/icons';
import { useCallback } from 'react';

export interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const toast = useToast();

  const onClick = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        toast({ status: 'success', duration: 1500, title: 'Copied' });
      }
    } catch {
      toast({ status: 'error', duration: 2000, title: 'Copy failed' });
    }
  }, [value, toast]);

  return (
    <Tooltip label={label} hasArrow>
      <IconButton
        aria-label={label}
        icon={<CopyIcon />}
        size="xs"
        variant="ghost"
        color="gray.250"
        onClick={onClick}
        _hover={{ color: 'brand.light', bg: 'gray.750' }}
      />
    </Tooltip>
  );
}
