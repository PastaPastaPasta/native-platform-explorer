// Field Manual palette. Two equally specified modes (Carbon dark / Paper light),
// plus a shared restrained accent and chain-status semantic tokens. Tokens here are
// raw values — components reference Chakra's `semanticTokens` aliases from theme.ts.

export const colors = {
  // Carbon (dark mode)
  carbon: {
    bg: '#0A0A0C',
    surface: '#131316',
    raised: '#1A1A1F',
    sunken: '#070708',
    ink: '#E8E6E1',
    muted: '#8A8780',
    faint: '#4A4844',
    hairline: 'rgba(232,230,225,0.10)',
    hairlineStrong: 'rgba(232,230,225,0.18)',
  },

  // Paper (light mode)
  paper: {
    bg: '#F4F1EA',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    sunken: '#EDE9DF',
    ink: '#14110F',
    muted: '#6B635A',
    faint: '#B4ADA2',
    hairline: 'rgba(20,17,15,0.12)',
    hairlineStrong: 'rgba(20,17,15,0.22)',
  },

  // Brand (single restrained accent — two shades for dark vs. light surfaces)
  brand: {
    normal: '#3FB8E6',
    light: '#7DD4F2',
    pressed: '#5BC8F0',
    deep: '#1A6DA5',
    shaded: '#164861',
  },

  // Chain-status semantic colors. Used in both modes.
  verified: '#6FCF97',
  trusted: '#F2C94C',
  failed: '#EB5757',
  warning: '#F2A341',

  // Legacy aliases — kept so the ~60 existing `success`/`danger`/`warning`/`orange`
  // call sites resolve without churn. New code should prefer the semantic names above.
  success: '#6FCF97',
  danger: '#EB5757',
  orange: '#F2A341',

  // Gray scale — repointed to Carbon-mode warm neutrals. Light-mode counterparts are
  // exposed via `semanticTokens` in theme.ts. Kept as flat keys for legacy refs.
  'gray-50': '#F4F1EA',
  'gray-100': '#E8E6E1',
  'gray-200': '#C9C5BD',
  'gray-250': '#B4ADA2',
  'gray-300': '#9C9489',
  'gray-400': '#8A8780',
  'gray-500': '#6B6862',
  'gray-525': '#5C594F',
  'gray-550': '#4A4844',
  'gray-600': '#3D3B37',
  'gray-650': '#2E2C29',
  'gray-675': '#26241F',
  'gray-700': '#1F1D1A',
  'gray-750': '#1A1A1F',
  'gray-800': '#131316',
  'gray-900': '#0A0A0C',
} as const;

export type ColorToken = keyof typeof colors;
