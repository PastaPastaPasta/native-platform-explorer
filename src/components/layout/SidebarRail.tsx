'use client';

import { Box, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Eyebrow } from '@ui/Eyebrow';

interface NavItem {
  href: string;
  label: string;
}
interface NavGroup {
  title: string;
  items: ReadonlyArray<NavItem>;
}

const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    title: 'Browse',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/search/', label: 'Search' },
    ],
  },
  {
    title: 'Entities',
    items: [
      { href: '/identity/', label: 'Identity' },
      { href: '/contract/', label: 'Contract' },
      { href: '/token/', label: 'Tokens' },
      { href: '/dpns/search', label: 'DPNS' },
      { href: '/evonode/', label: 'Evonodes' },
    ],
  },
  {
    title: 'Network',
    items: [
      { href: '/network/status', label: 'Status' },
      { href: '/epoch/', label: 'Epoch' },
      { href: '/network/protocol', label: 'Protocol' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { href: '/governance/contested', label: 'Contested' },
      { href: '/governance/polls/', label: 'Polls' },
    ],
  },
  {
    title: 'Write',
    items: [
      { href: '/broadcast', label: 'Broadcast' },
      { href: '/wallet', label: 'Wallet' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/query/', label: 'Query' },
      { href: '/tools/', label: 'Tools' },
      { href: '/sdk-reference', label: 'SDK ref' },
      { href: '/about', label: 'About' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  // Match exact path or first-segment prefix.
  const stripped = href.replace(/\/$/, '');
  return pathname === stripped || pathname.startsWith(`${stripped}/`);
}

export function SidebarNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <VStack align="stretch" spacing={5}>
      {NAV_GROUPS.map((g) => (
        <Box key={g.title}>
          <Eyebrow mb={2} pl={3}>
            {g.title}
          </Eyebrow>
          <VStack align="stretch" spacing="2px">
            {g.items.map((item) => {
              const active = isActive(pathname ?? '/', item.href);
              return (
                <Box
                  key={item.href}
                  as={NextLink}
                  href={item.href}
                  onClick={onNavigate}
                  display="block"
                  pl={3}
                  py={1.5}
                  borderLeft="2px solid"
                  borderColor={active ? 'accent' : 'transparent'}
                  color={active ? 'ink' : 'muted'}
                  fontSize="13px"
                  fontWeight={active ? 500 : 400}
                  _hover={{ color: 'ink', textDecoration: 'none' }}
                  transition="color 0.12s ease, border-color 0.12s ease"
                >
                  {item.label}
                </Box>
              );
            })}
          </VStack>
        </Box>
      ))}
    </VStack>
  );
}

export function SidebarRail() {
  return (
    <Box
      as="aside"
      display={{ base: 'none', md: 'block' }}
      borderRight="1px solid"
      borderColor="hairline"
      bg="bg"
      px={4}
      py={6}
      position="sticky"
      top="92px"
      alignSelf="start"
      maxH="calc(100vh - 92px)"
      overflowY="auto"
    >
      <SidebarNavBody />
    </Box>
  );
}
