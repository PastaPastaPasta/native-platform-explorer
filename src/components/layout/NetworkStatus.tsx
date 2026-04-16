'use client';

import { Badge, HStack, Text, Tooltip } from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';

export function NetworkStatus() {
  const { status, trusted, error } = useSdk();

  let label = 'Connecting…';
  let color: string = 'warning';
  let tooltip = 'Contacting DAPI…';

  switch (status) {
    case 'ready':
      label = trusted ? 'Proofs verified' : 'Untrusted mode';
      color = trusted ? 'success' : 'warning';
      tooltip = trusted
        ? 'Queries return cryptographic proofs verified by the WASM SDK in your browser.'
        : 'Untrusted mode: responses are fetched without proof verification.';
      break;
    case 'error':
      label = 'Disconnected';
      color = 'danger';
      tooltip = error?.message ?? 'The SDK failed to connect to DAPI.';
      break;
    case 'connecting':
      label = 'Connecting…';
      color = 'warning';
      tooltip = 'Contacting DAPI…';
      break;
    case 'idle':
    default:
      label = 'Idle';
      color = 'gray.400';
      tooltip = 'SDK has not started connecting yet.';
      break;
  }

  return (
    <Tooltip label={tooltip} hasArrow>
      <HStack spacing={2} as={Badge} variant="subtle" bg="gray.800" px={3} py={1} borderRadius="full">
        <Text as="span" color={color} fontWeight={600} fontSize="xs">
          ●
        </Text>
        <Text as="span" color="gray.100" fontSize="xs" textTransform="none">
          {label}
        </Text>
      </HStack>
    </Tooltip>
  );
}
