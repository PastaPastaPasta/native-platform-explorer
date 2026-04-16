'use client';

import { HStack, Spinner, Text, Tooltip } from '@chakra-ui/react';
import { CheckCircleIcon, InfoOutlineIcon, WarningTwoIcon } from '@chakra-ui/icons';
import { describeProofState, type ProofState } from '@sdk/proofs';

export interface ProofChipProps {
  proofState: ProofState;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
}

function meta(proofState: ProofState): { color: string; label: string; icon: React.ReactNode } {
  switch (proofState.kind) {
    case 'verified':
      return { color: 'success', label: 'Verified', icon: <CheckCircleIcon /> };
    case 'unverified-in-flight':
      return { color: 'gray.250', label: '…', icon: <Spinner size="xs" /> };
    case 'unverified-no-variant':
      return { color: 'gray.400', label: 'No proof', icon: <InfoOutlineIcon /> };
    case 'unverified-trusted-off':
      return { color: 'warning', label: 'Unverified', icon: <InfoOutlineIcon /> };
    case 'failed':
      return { color: 'danger', label: 'Proof failed', icon: <WarningTwoIcon /> };
    case 'unknown':
    default:
      return { color: 'gray.400', label: '—', icon: <InfoOutlineIcon /> };
  }
}

export function ProofChip({ proofState, size = 'sm', showLabel = true }: ProofChipProps) {
  const m = meta(proofState);
  const tooltip = describeProofState(proofState);
  const fs = size === 'xs' ? '2xs' : 'xs';
  return (
    <Tooltip label={tooltip} hasArrow>
      <HStack
        as="span"
        role="status"
        aria-label={tooltip}
        spacing={1}
        display="inline-flex"
        px={2}
        py={0.5}
        bg="gray.800"
        borderRadius="full"
        border="1px solid"
        borderColor="gray.750"
        fontSize={fs}
        color={m.color}
      >
        {m.icon}
        {showLabel ? <Text as="span" color={m.color}>{m.label}</Text> : null}
      </HStack>
    </Tooltip>
  );
}
