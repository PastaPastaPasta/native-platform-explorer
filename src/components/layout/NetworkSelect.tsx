'use client';

import React, { useReducer } from 'react';
import {
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronDownIcon, CloseIcon } from '@chakra-ui/icons';
import { useSdk } from '@sdk/hooks';
import {
  DEFAULT_NETWORK,
  getAvailableNetworks,
  getNetwork,
  isBuiltInNetwork,
  removeCustomDevnet,
  type NetworkConfig,
} from '@sdk/networks';
import { CustomDevnetModal } from './CustomDevnetModal';

export function NetworkSelect() {
  const { network, setNetwork } = useSdk();
  const modal = useDisclosure();
  // Registry mutations live outside React state; bump a counter to re-render.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const current = getNetwork(network);
  const all = getAvailableNetworks();
  const builtIns = all.filter((n) => n.type !== 'devnet');
  const devnets = all
    .filter((n) => n.type === 'devnet')
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleRemove = (name: string) => {
    if (name === network) setNetwork(DEFAULT_NETWORK);
    removeCustomDevnet(name);
    bump();
  };

  const renderItem = ({ name, label }: NetworkConfig) => {
    const isActive = name === network;
    return (
      <MenuItem
        key={name}
        bg="transparent"
        _hover={{ bg: 'gray.750' }}
        onClick={() => setNetwork(name)}
        fontWeight={isActive ? 600 : 400}
        color={isActive ? 'brand.light' : 'gray.100'}
      >
        <HStack flex="1" justify="space-between" spacing={2}>
          <Text>{label}</Text>
          {!isBuiltInNetwork(name) ? (
            <Box
              as="span"
              role="button"
              aria-label={`Remove ${label}`}
              tabIndex={0}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              boxSize={5}
              borderRadius="sm"
              color="gray.400"
              _hover={{ color: 'red.300', bg: 'gray.700' }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleRemove(name);
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(name);
                }
              }}
            >
              <CloseIcon boxSize={2} />
            </Box>
          ) : null}
        </HStack>
      </MenuItem>
    );
  };

  return (
    <>
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
          {builtIns.map(renderItem)}
          {devnets.length > 0 ? <MenuDivider borderColor="gray.700" /> : null}
          {devnets.map(renderItem)}
          <MenuDivider borderColor="gray.700" />
          <MenuItem
            bg="transparent"
            _hover={{ bg: 'gray.750' }}
            onClick={modal.onOpen}
            color="gray.250"
            fontStyle="italic"
          >
            Custom devnet…
          </MenuItem>
        </MenuList>
      </Menu>
      <CustomDevnetModal
        isOpen={modal.isOpen}
        onClose={modal.onClose}
        onSaved={(name) => {
          bump();
          setNetwork(name);
        }}
      />
    </>
  );
}
