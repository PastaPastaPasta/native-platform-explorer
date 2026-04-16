'use client';

import { HStack, Menu, MenuButton, MenuItem, MenuList, Button, Text } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export function PageSizeSelector({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (n: PageSize) => void;
}) {
  return (
    <HStack spacing={2}>
      <Text fontSize="xs" color="gray.400">
        Per page
      </Text>
      <Menu>
        <MenuButton as={Button} rightIcon={<ChevronDownIcon />} size="xs" variant="outline">
          {value}
        </MenuButton>
        <MenuList bg="gray.800" borderColor="gray.700" minWidth="auto">
          {PAGE_SIZES.map((size) => (
            <MenuItem
              key={size}
              bg="transparent"
              _hover={{ bg: 'gray.750' }}
              onClick={() => onChange(size)}
            >
              {size}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </HStack>
  );
}
