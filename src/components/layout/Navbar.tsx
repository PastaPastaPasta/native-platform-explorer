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
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@ui/Container';
import { GlobalSearchInput } from '@components/search/GlobalSearchInput';
import { NetworkSelect } from './NetworkSelect';
import { NetworkStatus } from './NetworkStatus';

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/identity/', label: 'Identities' },
  { href: '/contract/', label: 'Contracts' },
  { href: '/token/', label: 'Tokens' },
  { href: '/dpns/search', label: 'DPNS' },
  { href: '/epoch', label: 'Epoch' },
  { href: '/governance/contested', label: 'Governance' },
  { href: '/network/status', label: 'Network' },
  { href: '/about', label: 'About' },
];

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(href.split('/').slice(0, 2).join('/')));
  return (
    <Text
      as={NextLink}
      href={href}
      fontSize="sm"
      fontWeight={active ? 600 : 400}
      color={active ? 'brand.light' : 'gray.300'}
      _hover={{ color: 'gray.100' }}
      transition="color 0.2s ease"
      position="relative"
      py={1}
      onClick={onClick}
      sx={active ? {
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: '-4px',
          left: '0',
          right: '0',
          height: '2px',
          borderRadius: '1px',
          bg: 'brand.normal',
          opacity: 0.8,
        },
      } : undefined}
    >
      {label}
    </Text>
  );
}

export function Navbar() {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Box
      as="nav"
      position="sticky"
      top={0}
      zIndex={20}
      bg="rgba(24,29,32,0.85)"
      sx={{ backdropFilter: 'blur(44px)' }}
      borderBottom="1px solid"
      borderColor="rgba(255,255,255,0.06)"
      height="66px"
    >
      <Container height="100%">
        <Flex align="center" justify="space-between" height="100%" gap={4}>
          <HStack spacing={3}>
            <Text
              as={NextLink}
              href="/"
              fontFamily="heading"
              fontWeight={700}
              fontSize="md"
              color="gray.100"
              letterSpacing="0.04em"
            >
              NPE
            </Text>
            <Box w="1px" h="16px" bg="whiteAlpha.200" display={{ base: 'none', lg: 'block' }} />
            <Text as="span" fontSize="xs" color="gray.400" display={{ base: 'none', lg: 'inline' }} fontWeight={400}>
              Native Platform Explorer
            </Text>
          </HStack>

          <HStack spacing={5} display={{ base: 'none', lg: 'flex' }}>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </HStack>

          <HStack spacing={2}>
            <Box display={{ base: 'none', md: 'block' }}>
              <GlobalSearchInput />
            </Box>
            <NetworkSelect />
            <Box display={{ base: 'none', sm: 'block' }}>
              <NetworkStatus />
            </Box>
            <IconButton
              display={{ base: 'inline-flex', lg: 'none' }}
              aria-label="Open menu"
              icon={<HamburgerIcon />}
              size="sm"
              variant="ghost"
              onClick={onOpen}
            />
          </HStack>
        </Flex>
      </Container>

      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay bg="blackAlpha.700" />
        <DrawerContent bg="gray.900">
          <DrawerBody pt={10}>
            <VStack align="stretch" spacing={4}>
              <Box pb={4}>
                <GlobalSearchInput width="100%" autoFocus />
              </Box>
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.href} {...item} onClick={onClose} />
              ))}
              <Box pt={4}>
                <NetworkStatus />
              </Box>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
