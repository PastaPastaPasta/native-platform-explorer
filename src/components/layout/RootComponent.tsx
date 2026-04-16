'use client';

import { Flex, Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Container } from '@ui/Container';
import { Breadcrumbs } from '@components/breadcrumbs/Breadcrumbs';

export function RootComponent({ children }: { children: ReactNode }) {
  return (
    <Flex direction="column" minHeight="100vh">
      <Navbar />
      <Box as="main" flex="1" width="100%" pb={{ base: 10, md: 16 }}>
        <Container pt={{ base: 2, md: 4 }}>
          <Breadcrumbs />
        </Container>
        {children}
      </Box>
      <Footer />
    </Flex>
  );
}
