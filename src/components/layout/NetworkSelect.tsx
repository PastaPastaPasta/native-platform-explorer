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
        _hover={{ bg: 'raised' }}
        onClick={() => setNetwork(name)}
        fontWeight={isActive ? 500 : 400}
        color={isActive ? 'accent' : 'ink'}
        fontFamily="mono"
        fontSize="13px"
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
              borderRadius="badge"
              color="muted"
              _hover={{ color: 'failed', bg: 'sunken' }}
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
          size="xs"
          variant="ghost"
          fontFamily="mono"
          fontSize="11px"
          fontWeight={400}
          color="ink"
          border="1px solid"
          borderColor="hairline"
          borderRadius="card"
          px={2}
          _hover={{ borderColor: 'hairlineStrong', bg: 'transparent' }}
          _active={{ bg: 'transparent' }}
        >
          {current.label}
        </MenuButton>
        <MenuList bg="surface" borderColor="hairline" borderRadius="card" minW="220px">
          {builtIns.map(renderItem)}
          {devnets.length > 0 ? <MenuDivider borderColor="hairline" /> : null}
          {devnets.map(renderItem)}
          <MenuDivider borderColor="hairline" />
          <MenuItem
            bg="transparent"
            _hover={{ bg: 'raised' }}
            onClick={modal.onOpen}
            color="muted"
            fontFamily="mono"
            fontSize="13px"
          >
            + Custom devnet…
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
