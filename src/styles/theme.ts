import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { colors } from './colors';

// Default tracks the OS via `prefers-color-scheme`. Explicit toggles are persisted
// to Chakra's `chakra-ui-color-mode` key and override the system preference.
const config: ThemeConfig = {
  initialColorMode: 'system',
  useSystemColorMode: false,
};

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
    heading: 'var(--font-display), "Fraunces", Georgia, serif',
    body: 'var(--font-geist-sans), "Geist", system-ui, sans-serif',
    mono: 'var(--font-mono), "JetBrains Mono", ui-monospace, monospace',
  },
  colors: {
    brand: colors.brand,
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    orange: colors.orange,
    verified: colors.verified,
    trusted: colors.trusted,
    failed: colors.failed,
    gray: grayScale,
    carbon: colors.carbon,
    paper: colors.paper,
  },
  // Single set of names used by every component. Light/dark mappings live here so
  // components never branch on color mode.
  semanticTokens: {
    colors: {
      bg: { default: colors.paper.bg, _dark: colors.carbon.bg },
      surface: { default: colors.paper.surface, _dark: colors.carbon.surface },
      raised: { default: colors.paper.raised, _dark: colors.carbon.raised },
      sunken: { default: colors.paper.sunken, _dark: colors.carbon.sunken },
      ink: { default: colors.paper.ink, _dark: colors.carbon.ink },
      muted: { default: colors.paper.muted, _dark: colors.carbon.muted },
      faint: { default: colors.paper.faint, _dark: colors.carbon.faint },
      hairline: { default: colors.paper.hairline, _dark: colors.carbon.hairline },
      hairlineStrong: {
        default: colors.paper.hairlineStrong,
        _dark: colors.carbon.hairlineStrong,
      },
      accent: { default: colors.brand.deep, _dark: colors.brand.normal },
      accentHover: { default: colors.brand.shaded, _dark: colors.brand.light },
      accentMuted: { default: 'rgba(26,109,165,0.10)', _dark: 'rgba(63,184,230,0.10)' },
      // Legacy gray.* mappings — auto-flip light/dark so existing `gray.100`-style
      // call sites read correctly in both modes during the rollout. New code
      // should use the semantic names (`ink`, `muted`, `surface`, …).
      'gray.100': { default: colors.paper.ink, _dark: colors.carbon.ink },
      'gray.200': { default: colors.paper.ink, _dark: '#C9C5BD' },
      'gray.250': { default: colors.paper.muted, _dark: '#B4ADA2' },
      'gray.300': { default: colors.paper.muted, _dark: '#9C9489' },
      'gray.400': { default: colors.paper.muted, _dark: colors.carbon.muted },
      // `gray.500` is widely used for secondary/hint text; route to `muted` so it
      // meets WCAG AA in both modes rather than the lower-contrast `faint`.
      'gray.500': { default: colors.paper.muted, _dark: colors.carbon.muted },
      'gray.600': { default: colors.paper.hairlineStrong, _dark: '#3D3B37' },
      'gray.650': { default: colors.paper.sunken, _dark: '#2E2C29' },
      'gray.700': { default: colors.paper.sunken, _dark: '#1F1D1A' },
      'gray.750': { default: colors.paper.sunken, _dark: colors.carbon.raised },
      'gray.800': { default: colors.paper.sunken, _dark: colors.carbon.surface },
      'gray.900': { default: colors.paper.bg, _dark: colors.carbon.bg },
      // Legacy brand.normal → semantic accent (so dark+light both look right).
      'brand.normal': { default: colors.brand.deep, _dark: colors.brand.normal },
      'brand.light': { default: colors.brand.shaded, _dark: colors.brand.light },
    },
  },
  radii: {
    none: '0',
    badge: '2px',
    card: '4px',
    pill: '999px',
    // `block` kept as alias to `card` so existing `borderRadius="block"` consumers
    // don't break during rollout. Remove in a follow-up cleanup.
    block: '4px',
  },
  sizes: {
    container: {
      xl: '1310px',
    },
  },
  styles: {
    global: {
      'html, body': {
        bg: 'bg',
        color: 'ink',
        minHeight: '100vh',
      },
      a: {
        color: 'accent',
        _hover: { color: 'accentHover' },
      },
      'code, pre, .mono, [data-mono]': {
        fontFamily: 'mono',
        fontVariantNumeric: 'tabular-nums',
      },
      '.tabular': {
        fontVariantNumeric: 'tabular-nums',
      },
    },
  },
  components: {
    Button: {
      baseStyle: { fontFamily: 'body', fontWeight: 500, borderRadius: 'card' },
      defaultProps: { colorScheme: 'blue' },
    },
    Heading: {
      baseStyle: {
        fontFamily: 'heading',
        fontWeight: 500,
        letterSpacing: '-0.015em',
        fontFeatureSettings: '"ss01", "ss02"',
      },
    },
    Input: {
      defaultProps: { focusBorderColor: 'accent' },
    },
    Tabs: {
      defaultProps: { variant: 'line' },
    },
  },
});

export type AppTheme = typeof theme;
