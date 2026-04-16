// Palette ported from platform-explorer's theme. Dark mode only.
// IMPORTANT: no violet/purple tokens — the brand palette is blue + green + yellow + orange.

export const colors = {
  brand: {
    normal: '#008DE4',
    light: '#2CBBFF',
    deep: '#0E75B5',
    shaded: '#165278',
    pressed: '#0493EB',
  },
  success: '#1CC400',
  danger: '#F45858',
  warning: '#FFD205',
  orange: '#f49a58',
  'gray-50': '#f4f6f8',
  'gray-100': '#e0e3e5',
  'gray-200': '#c7ced2',
  'gray-250': '#93aab2',
  'gray-300': '#7a8f97',
  'gray-400': '#5d6f77',
  'gray-500': '#4a565c',
  'gray-525': '#434f54',
  'gray-550': '#3e494e',
  'gray-600': '#39454c',
  'gray-650': '#232C30',
  'gray-675': '#262e32',
  'gray-700': '#2e383c',
  'gray-750': '#39454C',
  'gray-800': '#2e393d',
  'gray-900': '#181d20',
} as const;

export type ColorToken = keyof typeof colors;
