import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';

// Fraunces — variable serif with optical sizing. Used for display headings and key
// metric readouts. Distinctive characterful face, not a generic AI default.
export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

// Geist — refined modern sans for UI body / labels. Shipped via the `geist` package
// (variable font, MIT) rather than `next/font/google`, which doesn't expose it.
export const geist = GeistSans;

// JetBrains Mono — IDs, hashes, numbers, code.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontClassName = [fraunces.variable, geist.variable, jetbrainsMono.variable].join(' ');
