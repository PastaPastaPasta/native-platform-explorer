import type { Metadata } from 'next';
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
    <html lang="en" className={fontClassName} data-theme="dark" suppressHydrationWarning>
      <body className="chakra-ui-dark">
        <Providers>
          <RootComponent>{children}</RootComponent>
        </Providers>
      </body>
    </html>
  );
}
