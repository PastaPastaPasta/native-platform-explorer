import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { theme } from '@styles/theme';
import { SdkContext, type SdkContextValue } from '@sdk/SdkProvider';
import { QueryProofStoreProvider } from '@contexts/QueryProofStore';
import { BreadcrumbsProvider } from '@contexts/BreadcrumbsContext';
import { ProofInspectorProvider } from '@components/proof/ProofInspectorContext';
import { createSdkContextValue } from './sdk';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

export function TestProviders({
  children,
  sdk,
  queryClient = createTestQueryClient(),
}: {
  children: ReactNode;
  sdk?: Partial<SdkContextValue>;
  queryClient?: QueryClient;
}) {
  return (
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <SdkContext.Provider value={createSdkContextValue(sdk)}>
          <QueryProofStoreProvider>
            <BreadcrumbsProvider>
              <ProofInspectorProvider>{children}</ProofInspectorProvider>
            </BreadcrumbsProvider>
          </QueryProofStoreProvider>
        </SdkContext.Provider>
      </QueryClientProvider>
    </ChakraProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & {
    sdk?: Partial<SdkContextValue>;
    queryClient?: QueryClient;
  } = {},
) {
  const { sdk, queryClient, ...renderOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders sdk={sdk} queryClient={queryClient}>
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  });
}
