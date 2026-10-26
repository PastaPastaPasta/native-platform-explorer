'use client';

import { Box, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Eyebrow } from '@ui/Eyebrow';
import { writeModeEnabled } from '@/config';

interface NavItem {
  href: string;
  label: string;
}
interface NavGroup {
  title: string;
  items: ReadonlyArray<NavItem>;
}

export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    title: 'Browse',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/search/', label: 'Search' },
      { href: '/saved/', label: 'Saved items' },
    ],
  },
  {
    title: 'Entities',
    items: [
      { href: '/identity/', label: 'Identity' },
      { href: '/contract/', label: 'Contract' },
      { href: '/token/', label: 'Tokens' },
      { href: '/dpns/search/', label: 'DPNS' },
      { href: '/evonode/', label: 'Evonodes' },
    ],
  },
  {
    title: 'Network',
    items: [
      { href: '/network/status/', label: 'Status' },
      { href: '/network/quorums/', label: 'Quorums' },
      { href: '/epoch/', label: 'Epoch' },
      { href: '/epoch/history/', label: 'Epoch history' },
      { href: '/network/protocol/', label: 'Protocol' },
      { href: '/network/credits/', label: 'Credits' },
      { href: '/network/shielded/', label: 'Shielded pool' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { href: '/governance/contested/', label: 'Contested' },
      { href: '/governance/polls/', label: 'Polls' },
      { href: '/groups/', label: 'Groups' },
    ],
  },
  {
    title: 'Write',
    items: [
      { href: '/broadcast/', label: 'Broadcast' },
      { href: '/wallet/', label: 'Wallet' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/query/', label: 'Query' },
      { href: '/tools/', label: 'Tools' },
      { href: '/sdk-reference/', label: 'SDK ref' },
      { href: '/settings/', label: 'Settings' },
      { href: '/about/', label: 'About' },
    ],
  },
];

const ALL_HREFS = NAV_GROUPS.flatMap((g) => g.items.map((item) => item.href));

function matches(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  // Match exact path or first-segment prefix.
  const stripped = href.replace(/\/$/, '');
  return pathname === stripped || pathname.startsWith(`${stripped}/`);
}

/** The single nav item for a path: the longest matching href, so
 *  /epoch/history/ marks "Epoch history" and not also "Epoch". */
export function activeHref(pathname: string): string | undefined {
  return ALL_HREFS.filter((href) => matches(pathname, href)).sort((a, b) => b.length - a.length)[0];
}

/** The groups to show: a build with write mode disabled drops the Write
 *  group, whose pages would only show the disabled notice. */
export function visibleNavGroups(): ReadonlyArray<NavGroup> {
  return writeModeEnabled() ? NAV_GROUPS : NAV_GROUPS.filter((g) => g.title !== 'Write');
}

export function SidebarNavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname ?? '/');
  return (
    <VStack align="stretch" spacing={5}>
      {visibleNavGroups().map((g) => (
        <Box key={g.title}>
          <Eyebrow mb={2} pl={3}>
            {g.title}
          </Eyebrow>
          <VStack align="stretch" spacing="2px">
            {g.items.map((item) => {
              const active = item.href === current;
              return (
                <Box
                  key={item.href}
                  as={NextLink}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  display="block"
                  pl={3}
                  py={2}
                  minH="36px"
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
      aria-label="Main navigation"
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
