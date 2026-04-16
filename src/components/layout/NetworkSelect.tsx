'use client';

import { Menu, MenuButton, MenuItem, MenuList, Button } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useSdk } from '@sdk/hooks';
import { networkConfig, type Network } from '@sdk/networks';

export function NetworkSelect() {
  const { network, setNetwork } = useSdk();
  const current = networkConfig[network];

  return (
    <Menu>
      <MenuButton
        as={Button}
        rightIcon={<ChevronDownIcon />}
        size="sm"
        variant="outline"
        borderColor="gray.700"
        color="gray.100"
        _hover={{ borderColor: 'brand.normal', color: 'brand.light' }}
      >
        {current.label}
      </MenuButton>
      <MenuList bg="gray.800" borderColor="gray.700">
        {(Object.keys(networkConfig) as Network[]).map((n) => (
          <MenuItem
            key={n}
            bg="transparent"
            _hover={{ bg: 'gray.750' }}
            onClick={() => setNetwork(n)}
            fontWeight={n === network ? 600 : 400}
            color={n === network ? 'brand.light' : 'gray.100'}
          >
            {networkConfig[n].label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}
