import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';

// Fraunces — variable serif with optical sizing. Used for display headings and key
// metric readouts. Distinctive characterful face, not a generic AI default.
export const fraunces = localFont({
  src: './fonts/Fraunces.ttf',
  weight: '100 900',
  variable: '--font-display',
  display: 'swap',
});

// Geist — refined modern sans for UI body / labels. Shipped via the `geist` package
// (variable font, MIT) rather than `next/font/google`, which doesn't expose it.
export const geist = GeistSans;

// JetBrains Mono — IDs, hashes, numbers, code.
export const jetbrainsMono = localFont({
  src: './fonts/JetBrainsMono.ttf',
  weight: '100 800',
  variable: '--font-mono',
  display: 'swap',
});

export const fontClassName = [fraunces.variable, geist.variable, jetbrainsMono.variable].join(' ');
