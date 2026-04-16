'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState, type ReactNode } from 'react';
import { theme } from '@styles/theme';
import { SdkProvider } from '@sdk/SdkProvider';
import { BreadcrumbsProvider } from '@contexts/BreadcrumbsContext';
import { ErrorBoundary } from '@components/layout/ErrorBoundary';
import { SignerProvider } from '@/signer/SignerProvider';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  return (
    <CacheProvider>
      <ChakraProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <NuqsAdapter>
            <SdkProvider>
              <SignerProvider>
                <BreadcrumbsProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </BreadcrumbsProvider>
              </SignerProvider>
            </SdkProvider>
          </NuqsAdapter>
        </QueryClientProvider>
      </ChakraProvider>
    </CacheProvider>
  );
}
