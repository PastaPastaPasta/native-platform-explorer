'use client';

import { Box, Grid, GridItem } from '@chakra-ui/react';
import { useEffect, type ReactNode } from 'react';
import { BrandRow } from './BrandRow';
import { MeterBar } from './MeterBar';
import { SidebarRail } from './SidebarRail';
import { Footer } from './Footer';
import { Breadcrumbs } from '@components/breadcrumbs/Breadcrumbs';
import { DiagnosticsDrawer } from '@components/diagnostics/DiagnosticsDrawer';
import { QueryInspectorDrawer } from '@components/query-inspector/QueryInspectorDrawer';
import { ProofInspector } from '@components/proof/ProofInspector';
import { recordShellReady } from '@sdk/timing';
import { SdkSessionNotice, SdkVersionNotice } from './SdkNotices';

export function RootComponent({ children }: { children: ReactNode }) {
  useEffect(recordShellReady, []);

  return (
    <Box minH="100vh" bg="bg" color="ink">
      <BrandRow />
      <MeterBar />
      <Grid
        templateColumns={{ base: '1fr', md: '224px 1fr' }}
        alignItems="stretch"
        minH="calc(100vh - 92px)"
      >
        <GridItem display={{ base: 'none', md: 'block' }}>
          <SidebarRail />
        </GridItem>
        <GridItem as="main" minW={0}>
          <Box px={{ base: 4, md: 6, xl: 8 }} pt={4}>
            <Breadcrumbs />
          </Box>
          <Box px={{ base: 4, md: 6, xl: 8 }} pb={{ base: 10, md: 16 }}>
            <SdkSessionNotice />
            <SdkVersionNotice />
            {children}
          </Box>
          <Footer />
        </GridItem>
      </Grid>

      <DiagnosticsDrawer />
      <QueryInspectorDrawer />
      <ProofInspector />
    </Box>
  );
}
