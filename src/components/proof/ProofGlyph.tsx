'use client';

import { Box, Tooltip } from '@chakra-ui/react';
import { useProofInspector, type ProofPayload, type ProofStatus } from './ProofInspectorContext';

const COLOR_BY_STATUS: Record<ProofStatus, string> = {
  verified: 'verified',
  // Grey, not yellow — "served without a proof" is informational, not a warning.
  trusted: 'muted',
  failed: 'failed',
};

const LABEL_BY_STATUS: Record<ProofStatus, string> = {
  verified: 'Proof verified in browser',
  trusted: 'Trust mode — no proof verification this request',
  failed: 'Proof verification failed',
};

export interface ProofGlyphProps {
  status: ProofStatus;
  payload?: ProofPayload;
  label?: string;
  size?: 'xs' | 'sm';
}

const SIZES = {
  xs: { hit: '12px', dot: '8px' },
  sm: { hit: '14px', dot: '10px' },
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
        onClick={handleClick}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        width={hit}
        height={hit}
        borderRadius="pill"
        bg="transparent"
        _hover={{ bg: 'sunken' }}
        cursor="pointer"
      >
        <Box width={dot} height={dot} borderRadius="pill" bg={COLOR_BY_STATUS[status]} />
      </Box>
    </Tooltip>
  );
}
