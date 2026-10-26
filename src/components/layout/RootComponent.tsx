'use client';

import { Box, Grid, GridItem } from '@chakra-ui/react';
import { MotionConfig } from 'framer-motion';
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
import { SdkSessionNotice } from './SdkNotices';
import { PrefetchHost } from './PrefetchHost';
import { ServiceWorkerManager } from './ServiceWorkerManager';

export function RootComponent({ children }: { children: ReactNode }) {
  useEffect(recordShellReady, []);

  return (
    // Chakra's Collapse, Modal and Drawer animate with framer-motion; follow
    // the OS reduce-motion setting (PRD §11.8). CSS animations: global.scss.
    <MotionConfig reducedMotion="user">
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
              {children}
            </Box>
            <Footer />
          </GridItem>
        </Grid>

        <DiagnosticsDrawer />
        <QueryInspectorDrawer />
        <ProofInspector />
        <PrefetchHost />
        <ServiceWorkerManager />
      </Box>
    </MotionConfig>
  );
}
