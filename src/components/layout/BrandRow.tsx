'use client';

import {
  Box,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { Logotype } from './Logotype';
import { ThemeToggle } from './ThemeToggle';
import { NetworkSelect } from './NetworkSelect';
import { GlobalSearchInput } from '@components/search/GlobalSearchInput';
import { SidebarNavBody } from './SidebarRail';

export function BrandRow() {
  const drawer = useDisclosure();

  return (
    <Box
      as="header"
      borderBottom="1px solid"
      borderColor="hairline"
      bg="bg"
      px={{ base: 4, md: 6 }}
      h="52px"
      display="flex"
      alignItems="center"
    >
      <Flex w="100%" align="center" gap={4} justify="space-between">
        <HStack spacing={4}>
          <IconButton
            display={{ base: 'inline-flex', md: 'none' }}
            aria-label="Open menu"
            icon={<HamburgerIcon />}
            size="sm"
            variant="ghost"
            color="ink"
            onClick={drawer.onOpen}
          />
          <Logotype />
        </HStack>

        <Box flex="1" maxW="520px" display={{ base: 'none', md: 'block' }}>
          <GlobalSearchInput width="100%" />
        </Box>

        <HStack spacing={3}>
          <Box display={{ base: 'none', sm: 'block' }}>
            <NetworkSelect />
          </Box>
          <ThemeToggle />
        </HStack>
      </Flex>

      <Drawer isOpen={drawer.isOpen} placement="left" onClose={drawer.onClose}>
        <DrawerOverlay bg="blackAlpha.700" />
        <DrawerContent bg="surface" aria-label="Main navigation">
          <DrawerBody pt={10}>
            <VStack align="stretch" spacing={4}>
              <Box pb={2}>
                <GlobalSearchInput width="100%" autoFocus />
              </Box>
              <SidebarNavBody onNavigate={drawer.onClose} />
              <Box pt={2}>
                <NetworkSelect />
              </Box>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
