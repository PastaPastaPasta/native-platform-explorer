import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { colors } from './colors';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

// Derive the Chakra-shaped gray scale from the flat 'gray-NNN' keys in colors.ts.
const grayScale = Object.fromEntries(
  Object.entries(colors)
    .filter(([k]) => k.startsWith('gray-'))
    .map(([k, v]) => [k.slice('gray-'.length), v]),
) as Record<string, string>;

export const theme = extendTheme({
  config,
  breakpoints: {
    sm: '30em',
    md: '48em',
    lg: '62em',
    xl: '80em',
    '2xl': '96em',
    '3xl': '120em',
  },
  fonts: {
    heading: 'var(--font-heading), Montserrat, system-ui, sans-serif',
    body: 'var(--font-body), "Open Sans", system-ui, sans-serif',
    mono: 'var(--font-mono), "Roboto Mono", ui-monospace, monospace',
  },
  colors: {
    brand: colors.brand,
    // Flat string tokens — `color="success"` resolves to the hex value via Chakra's
    // token lookup. No `.default` sub-path (that's a semanticTokens concept).
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    orange: colors.orange,
    gray: grayScale,
  },
  radii: {
    block: '30px',
  },
  sizes: {
    container: {
      xl: '1310px',
      maxPageW: '1920px',
    },
  },
  styles: {
    global: {
      'html, body': {
        bg: 'gray.900',
        color: 'gray.100',
        minHeight: '100vh',
      },
      a: {
        color: 'brand.normal',
        _hover: { color: 'brand.light' },
      },
    },
  },
  components: {
    Button: {
      baseStyle: { fontFamily: 'body', fontWeight: 600 },
      defaultProps: { colorScheme: 'blue' },
    },
    Heading: { baseStyle: { fontFamily: 'heading' } },
  },
});

export type AppTheme = typeof theme;
