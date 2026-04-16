import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { colors } from './colors';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

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
    success: { default: colors.success },
    danger: { default: colors.danger },
    warning: { default: colors.warning },
    orange: { default: colors.orange },
    gray: {
      50: colors['gray-50'],
      100: colors['gray-100'],
      200: colors['gray-200'],
      250: colors['gray-250'],
      300: colors['gray-300'],
      400: colors['gray-400'],
      500: colors['gray-500'],
      525: colors['gray-525'],
      550: colors['gray-550'],
      600: colors['gray-600'],
      650: colors['gray-650'],
      675: colors['gray-675'],
      700: colors['gray-700'],
      750: colors['gray-750'],
      800: colors['gray-800'],
      900: colors['gray-900'],
    },
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
