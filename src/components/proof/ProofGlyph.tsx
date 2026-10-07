'use client';

import { Box, Tooltip } from '@chakra-ui/react';
import { useProofInspector, type ProofPayload, type ProofStatus } from './ProofInspectorContext';

const COLOR_BY_STATUS: Record<ProofStatus, string> = {
  verified: 'verified',
  // Grey, not yellow — "served without a proof" is informational, not a warning.
  trusted: 'muted',
  failed: 'failed',
  unavailable: 'muted',
};

const LABEL_BY_STATUS: Record<ProofStatus, string> = {
  verified: 'SDK verified this response using trusted quorum keys',
  trusted: 'Response not verified',
  failed: 'Proof verification failed',
  unavailable: 'Query unavailable; verification not completed',
};

export interface ProofGlyphProps {
  status: ProofStatus;
  payload?: ProofPayload;
  label?: string;
  size?: 'xs' | 'sm';
}

const SIZES = {
  xs: { hit: '44px', dot: '8px' },
  sm: { hit: '44px', dot: '10px' },
} as const;

export function ProofGlyph({ status, payload, label, size = 'xs' }: ProofGlyphProps) {
  const { open } = useProofInspector();
  const { hit, dot } = SIZES[size];
  const tooltip = label ?? LABEL_BY_STATUS[status];

  const handleClick = () => {
    if (payload) {
      open({ ...payload, status });
    } else {
      open({ title: tooltip, status, notes: tooltip });
    }
  };

  return (
    <Tooltip label={tooltip} openDelay={400} hasArrow placement="top">
      <Box
        as="button"
        type="button"
        aria-label={tooltip}
        aria-haspopup="dialog"
        onClick={handleClick}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        width={hit}
        height={hit}
        minW={hit}
        minH={hit}
        borderRadius="pill"
        bg="transparent"
        _hover={{ bg: 'sunken' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }}
        cursor="pointer"
      >
        <Box width={dot} height={dot} borderRadius="pill" bg={COLOR_BY_STATUS[status]} />
      </Box>
    </Tooltip>
  );
}
