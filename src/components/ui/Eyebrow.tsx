'use client';

import { Text, type TextProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Field Manual small-caps eyebrow label. Mono, muted, uppercase.
 * Single source of truth for the section-label / micro-label pattern that
 * repeats across the layout, stat cells, sidebar, and proof inspector.
 */
export interface EyebrowProps extends Omit<TextProps, 'children'> {
  children: ReactNode;
  /** Font size override; defaults to 10px (sidebar/stat-cell scale). */
  size?: string;
  /** Letter spacing override; defaults to 0.14em. */
  tracking?: string;
}

export function Eyebrow({
  children,
  size = '10px',
  tracking = '0.14em',
  ...rest
}: EyebrowProps) {
  return (
    <Text
      fontFamily="mono"
      fontSize={size}
      color="muted"
      textTransform="uppercase"
      letterSpacing={tracking}
      {...rest}
    >
      {children}
    </Text>
  );
}
