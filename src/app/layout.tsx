import type { Metadata } from 'next';
import { ColorModeScript } from '@chakra-ui/react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
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
        {/* URL state (tabs, document filters) for the app router; kept out of
            Providers so the SDK session tree stays independent of it. */}
        <NuqsAdapter>
          <Providers>
            <RootComponent>{children}</RootComponent>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
