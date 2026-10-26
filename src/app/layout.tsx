import type { Metadata } from 'next';
import { ColorModeScript } from '@chakra-ui/react';
import { fontClassName } from '@styles/fonts';
import { Providers } from './Providers';
import { RootComponent } from '@components/layout/RootComponent';
import '@styles/global.scss';

export const metadata: Metadata = {
  title: 'Native Platform Explorer',
  description:
    'A proof-verified, client-only Dash Platform explorer powered exclusively by @dashevo/evo-sdk.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontClassName} suppressHydrationWarning>
      <body>
        <ColorModeScript initialColorMode="system" />
        <Providers>
          <RootComponent>{children}</RootComponent>
        </Providers>
      </body>
    </html>
  );
}
