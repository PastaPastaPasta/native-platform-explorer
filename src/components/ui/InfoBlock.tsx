'use client';

import { Box, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export type InfoBlockVariant = 'normal' | 'accent' | 'sunken';

export interface InfoBlockProps extends Omit<BoxProps, 'title'> {
  /** Backwards-compat for the old API; equivalent to `variant="accent"`. */
  emphasised?: boolean;
  variant?: InfoBlockVariant;
  children?: ReactNode;
}

const VARIANT_STYLES: Record<InfoBlockVariant, BoxProps> = {
  normal: {
    bg: 'surface',
    borderColor: 'hairline',
    _hover: { borderColor: 'hairlineStrong' },
  },
  accent: {
    bg: 'surface',
    borderColor: 'accent',
    _hover: { borderColor: 'accentHover' },
  },
  sunken: {
    bg: 'sunken',
    borderColor: 'transparent',
    _hover: {},
  },
};

/**
 * Field Manual panel. Flat solid surface, hairline border, small radius.
 * No backdrop blur, no gradient, no shadow.
 */
export function InfoBlock({
  emphasised,
  variant: variantProp,
  children,
  ...rest
}: InfoBlockProps) {
  const variant: InfoBlockVariant = variantProp ?? (emphasised ? 'accent' : 'normal');
  const styles = VARIANT_STYLES[variant];

  return (
    <Box
      borderRadius="card"
      border="1px solid"
      transition="border-color 0.15s ease"
      p={{ base: 4, md: 5 }}
      {...styles}
      {...rest}
    >
      {children}
    </Box>
  );
}
